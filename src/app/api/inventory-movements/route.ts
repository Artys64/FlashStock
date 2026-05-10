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
    permission: "movements.read",
  });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const page = parsePositiveInt(params.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(params.get("pageSize"), 20), 100);
  const movementType = params.get("movementType");
  const batchId = params.get("batchId");
  const from = params.get("from");
  const to = params.get("to");

  const fromIndex = (page - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
  let query = client
    .from("inventory_movements")
    .select("*", { count: "exact" })
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .range(fromIndex, toIndex);

  if (movementType) query = query.eq("movement_type", movementType);
  if (batchId) query = query.eq("batch_id", batchId);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

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








