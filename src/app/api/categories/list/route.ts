import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizeRequest } from "@/lib/auth/guard";
import { NextRequest, NextResponse } from "next/server";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  if (!organizationId) {
    return badRequest("Missing organizationId query param.");
  }
  if (!establishmentId) {
    return badRequest("Missing establishmentId query param.");
  }

  const auth = await authorizeRequest({
    request,
    establishmentId,
    permission: "inventory.read",
  });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
  const { data, error } = await client
    .from("categories")
    .select("id, organization_id, name, lead_time_alert_days, created_at")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) return internalServerError();
  return NextResponse.json({ data: data ?? [] });
}

