import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  establishmentId: z.string().uuid(),
  status: z.enum(["pending", "sent", "failed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(request: NextRequest) {
  try {
    const payload = querySchema.parse({
      establishmentId: request.nextUrl.searchParams.get("establishmentId"),
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? "1",
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? "30",
    });

    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "admin.manage",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    let query = client
      .from("alert_email_notifications")
      .select(
        "id, batch_id, user_id, recipient_email, notification_kind, milestone_days, operation_date, status, attempts, last_error, next_retry_at, last_attempt_at, sent_at, created_at",
        { count: "exact" },
      )
      .eq("establishment_id", payload.establishmentId)
      .order("created_at", { ascending: false });

    if (payload.status) {
      query = query.eq("status", payload.status);
    }

    const from = (payload.page - 1) * payload.pageSize;
    const to = from + payload.pageSize - 1;
    const { data, count, error } = await query.range(from, to);
    if (error) return internalServerError();

    return NextResponse.json({
      data: data ?? [],
      pagination: {
        page: payload.page,
        pageSize: payload.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / payload.pageSize) : 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues[0]?.message ?? "Invalid query params.");
    }
    return handleRouteError(error);
  }
}
