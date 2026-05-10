import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizeRequest } from "@/lib/auth/guard";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { z } from "zod";
import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";

const createCategorySchema = z.object({
  establishmentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  leadTimeAlertDays: z.number().int().nonnegative(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = createCategorySchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "inventory.write",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client
      .from("categories")
      .insert({
        organization_id: payload.organizationId,
        name: payload.name,
        lead_time_alert_days: payload.leadTimeAlertDays,
      })
      .select()
      .single();

    if (error) return internalServerError();
    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: payload.establishmentId,
      entityType: "category",
      entityId: String((data as { id?: string } | null)?.id ?? ""),
      action: "category_created",
      actorUserId: auth.session.userId,
      payload: {
        organizationId: payload.organizationId,
        name: payload.name,
        leadTimeAlertDays: payload.leadTimeAlertDays,
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}








