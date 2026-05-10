import { authorizeRequest } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const establishmentId = params.get("establishmentId");
  if (!establishmentId) {
    return badRequest("Missing establishmentId query param.");
  }
  const auth = await authorizeRequest({
    request,
    establishmentId,
    permission: "audit.read",
  });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const page = parsePositiveInt(params.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(params.get("pageSize"), 20), 100);
  const entityType = params.get("entityType");
  const entityId = params.get("entityId");
  const fromIndex = (page - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
  let query = client
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .range(fromIndex, toIndex);

  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error, count } = await query;
  if (error) return internalServerError();

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}








