import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";
import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { MAX_EMAIL_RETRY_ATTEMPTS } from "@/lib/notifications/retry-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const retrySchema = z.object({
  establishmentId: z.string().uuid(),
  notificationIds: z.array(z.string().uuid()).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = retrySchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "admin.manage",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const nowIso = new Date().toISOString();

    let listQuery = client
      .from("alert_email_notifications")
      .select("id, batch_id")
      .eq("establishment_id", payload.establishmentId)
      .eq("status", "failed")
      .lt("attempts", MAX_EMAIL_RETRY_ATTEMPTS);

    if (payload.notificationIds && payload.notificationIds.length > 0) {
      listQuery = listQuery.in("id", payload.notificationIds);
    }

    const { data: rows, error: listError } = await listQuery.limit(200);
    if (listError) return internalServerError();

    const ids = (rows ?? []).map((row) => String((row as { id: string }).id));
    if (ids.length === 0) {
      return NextResponse.json({ data: { retriedCount: 0 } });
    }

    const { error: updateError } = await client
      .from("alert_email_notifications")
      .update({
        status: "pending",
        next_retry_at: nowIso,
        updated_at: nowIso,
      })
      .eq("establishment_id", payload.establishmentId)
      .in("id", ids);
    if (updateError) return internalServerError();

    const auditRepository = new SupabaseAuditLogsRepository(client);
    for (const row of rows ?? []) {
      const typed = row as { id: string; batch_id: string };
      await auditRepository.create({
        establishmentId: payload.establishmentId,
        entityType: "batch",
        entityId: typed.batch_id,
        action: "alert_email_retry_requested",
        actorUserId: auth.session.userId,
        payload: {
          notificationId: typed.id,
          operation: "manual_retry",
        },
      });
    }

    return NextResponse.json({ data: { retriedCount: ids.length } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues[0]?.message ?? "Invalid request payload.");
    }
    return handleRouteError(error);
  }
}
