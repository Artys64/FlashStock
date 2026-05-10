import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";
import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createInvitationSchema = z.object({
  establishmentId: z.string().uuid(),
  email: z.string().email(),
  roleId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

const revokeInvitationSchema = z.object({
  establishmentId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  if (!establishmentId) return badRequest("Missing establishmentId query param.");

  const auth = await authorizeRequest({ request, establishmentId, permission: "admin.manage" });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
  const { data, error } = await client
    .from("establishment_invitations")
    .select("id, email, role_id, status, invited_by, created_at, expires_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) return internalServerError();
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const payload = createInvitationSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "admin.manage",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client
      .from("establishment_invitations")
      .insert({
        establishment_id: payload.establishmentId,
        email: payload.email.toLowerCase(),
        role_id: payload.roleId,
        status: "pending",
        invited_by: auth.session.userId,
        expires_at: payload.expiresAt ?? null,
      })
      .select("id, email, role_id, status, invited_by, created_at, expires_at")
      .single();
    if (error) return internalServerError();

    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: payload.establishmentId,
      entityType: "invitation",
      entityId: String((data as { id?: string } | null)?.id ?? ""),
      action: "invitation_created",
      actorUserId: auth.session.userId,
      payload: {
        email: payload.email.toLowerCase(),
        roleId: payload.roleId,
        expiresAt: payload.expiresAt ?? null,
      },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = revokeInvitationSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "admin.manage",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client
      .from("establishment_invitations")
      .update({ status: "revoked" })
      .eq("id", payload.invitationId)
      .eq("establishment_id", payload.establishmentId)
      .select("id, status")
      .maybeSingle();
    if (error) return internalServerError();
    if (!data) return badRequest("Invitation not found for this establishment.");

    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: payload.establishmentId,
      entityType: "invitation",
      entityId: payload.invitationId,
      action: "invitation_revoked",
      actorUserId: auth.session.userId,
      payload: { invitationId: payload.invitationId },
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
