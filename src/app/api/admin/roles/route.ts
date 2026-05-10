import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  if (!establishmentId) return badRequest("Missing establishmentId query param.");

  const auth = await authorizeRequest({ request, establishmentId, permission: "admin.manage" });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
  const { data: establishment, error: establishmentError } = await client
    .from("establishments")
    .select("organization_id")
    .eq("id", establishmentId)
    .single();
  if (establishmentError) return internalServerError();

  const organizationId = String((establishment as { organization_id?: string } | null)?.organization_id ?? "");
  if (!organizationId) return internalServerError();

  const { data: roles, error: rolesError } = await client
    .from("roles")
    .select("id, name, organization_id")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (rolesError) return internalServerError();

  return NextResponse.json({ data: roles ?? [] });
}
