import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthSession } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { z } from "zod";
import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";

const createEstablishmentSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthSession(request);
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data: roleRows, error: rolesError } = await client
      .from("user_roles")
      .select("establishment_id")
      .eq("user_id", auth.session.userId);

    if (rolesError) return internalServerError();

    const establishmentIds = Array.from(
      new Set((roleRows ?? []).map((row) => String((row as { establishment_id: string }).establishment_id))),
    );
    if (establishmentIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const { data: establishments, error: establishmentsError } = await client
      .from("establishments")
      .select("id, organization_id, name")
      .in("id", establishmentIds)
      .order("name", { ascending: true });

    if (establishmentsError) return internalServerError();

    return NextResponse.json({ data: establishments ?? [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthSession(request);
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const payload = createEstablishmentSchema.parse(await request.json());
    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client
      .from("establishments")
      .insert({
        organization_id: payload.organizationId,
        name: payload.name,
      })
      .select()
      .single();
    if (error) return internalServerError();
    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: String((data as { id?: string } | null)?.id ?? ""),
      entityType: "establishment",
      entityId: String((data as { id?: string } | null)?.id ?? ""),
      action: "establishment_created",
      actorUserId: auth.session.userId,
      payload: {
        organizationId: payload.organizationId,
        name: payload.name,
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}








