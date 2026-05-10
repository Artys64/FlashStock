import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";
import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateUserRoleSchema = z.object({
  establishmentId: z.string().uuid(),
  userId: z.string().uuid(),
  roleId: z.string().uuid().nullable(),
});

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  if (!establishmentId) return badRequest("Missing establishmentId query param.");

  const auth = await authorizeRequest({ request, establishmentId, permission: "admin.manage" });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
  const { data, error } = await client
    .from("user_roles")
    .select(
      `
      user_id,
      role_id,
      created_at,
      roles(id, name)
    `,
    )
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) return internalServerError();
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = updateUserRoleSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "admin.manage",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    if (payload.roleId === null) {
      const { error } = await client
        .from("user_roles")
        .delete()
        .eq("establishment_id", payload.establishmentId)
        .eq("user_id", payload.userId);
      if (error) return internalServerError();

      await new SupabaseAuditLogsRepository(client).create({
        establishmentId: payload.establishmentId,
        entityType: "user_role",
        entityId: payload.userId,
        action: "user_removed_from_establishment",
        actorUserId: auth.session.userId,
        payload: { userId: payload.userId },
      });
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await client
      .from("user_roles")
      .upsert(
        {
          establishment_id: payload.establishmentId,
          user_id: payload.userId,
          role_id: payload.roleId,
        },
        { onConflict: "establishment_id,user_id" },
      )
      .select("establishment_id, user_id, role_id")
      .single();
    if (error) return internalServerError();

    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: payload.establishmentId,
      entityType: "user_role",
      entityId: payload.userId,
      action: "user_role_updated",
      actorUserId: auth.session.userId,
      payload: {
        userId: payload.userId,
        roleId: payload.roleId,
      },
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
