import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";
import { shouldArchiveBatch } from "@/lib/inventory/archive";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const establishmentId = params.get("establishmentId");
  if (!establishmentId) return badRequest("Missing establishmentId query param.");

  const auth = await authorizeRequest({
    request,
    establishmentId,
    permission: "inventory.read",
  });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const page = parsePositiveInt(params.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(params.get("pageSize"), 20), 100);

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });

  const { data: archivedRows, error } = await client
    .from("batches")
    .select("id, product_id, lot_code, expiry_date, quantity_current, cost_price, updated_at, archived_at")
    .eq("establishment_id", establishmentId)
    .eq("quantity_current", 0)
    .order("archived_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) return internalServerError();

  const all = (archivedRows ?? []).filter((row) => {
    const typed = row as Record<string, unknown>;
    return typed.archived_at !== null || shouldArchiveBatch({
      quantityCurrent: Number(typed.quantity_current),
      updatedAt: String(typed.updated_at),
    });
  });

  const start = (page - 1) * pageSize;
  const data = all.slice(start, start + pageSize);

  return NextResponse.json({
    data,
    pagination: {
      page,
      pageSize,
      total: all.length,
      totalPages: Math.ceil(all.length / pageSize),
    },
  });
}
