import { computeBatchStatus } from "@/core/domain/rules";
import { authorizeRequest } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";

type BatchRow = {
  id: string;
  product_id: string;
  lot_code: string;
  expiry_date: string;
  quantity_current: number;
  cost_price: number;
  location_id: string | null;
  quarantined: boolean;
  version: number;
  created_at: string;
  archived_at: string | null;
  products: {
    id: string;
    name: string;
    sku: string;
    category_id: string;
  } | null;
};

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  const productId = request.nextUrl.searchParams.get("productId");
  const statusFilter = request.nextUrl.searchParams.get("status");
  const quarantinedFilter = request.nextUrl.searchParams.get("quarantined");
  const expiryFilter = request.nextUrl.searchParams.get("expiry");

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
  let query = client
    .from("batches")
    .select(
      `
      id,
      product_id,
      lot_code,
      expiry_date,
      quantity_current,
      cost_price,
      location_id,
      quarantined,
      version,
      created_at,
      archived_at,
      products(id, name, sku, category_id)
    `,
    )
    .eq("establishment_id", establishmentId)
    .is("archived_at", null)
    .order("expiry_date", { ascending: true });

  if (productId) query = query.eq("product_id", productId);

  const { data: batches, error: batchesError } = await query;
  if (batchesError) {
    return internalServerError();
  }

  const rows = (batches ?? []) as unknown as BatchRow[];
  const categoryIds = Array.from(
    new Set(rows.map((row) => row.products?.category_id).filter(Boolean)),
  ) as string[];

  const { data: categories, error: categoriesError } = await client
    .from("categories")
    .select("id, lead_time_alert_days")
    .in("id", categoryIds.length ? categoryIds : ["00000000-0000-0000-0000-000000000000"]);

  if (categoriesError) {
    return internalServerError();
  }

  const leadTimeByCategory = new Map<string, number>();
  for (const row of categories ?? []) {
    const typed = row as { id: string; lead_time_alert_days: number };
    leadTimeByCategory.set(typed.id, typed.lead_time_alert_days);
  }

  const enriched = rows.map((row) => {
    const leadTimeAlertDays = row.products?.category_id
      ? (leadTimeByCategory.get(row.products.category_id) ?? 0)
      : 0;

    const status = computeBatchStatus({
      batch: {
        expiryDate: row.expiry_date,
        quantityCurrent: Number(row.quantity_current),
        quarantined: row.quarantined,
      },
      leadTimeAlertDays,
    });

    return {
      ...row,
      status,
      leadTimeAlertDays,
    };
  });

  const filtered =
    statusFilter && ["active", "alert", "expired", "quarantine"].includes(statusFilter)
      ? enriched.filter((row) => row.status === statusFilter)
      : enriched;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const plus7 = new Date(now);
  plus7.setDate(plus7.getDate() + 7);
  const plus30 = new Date(now);
  plus30.setDate(plus30.getDate() + 30);

  const dateFiltered = filtered.filter((row) => {
    if (quarantinedFilter === "true" && !row.quarantined) return false;
    if (quarantinedFilter === "false" && row.quarantined) return false;

    if (!expiryFilter || expiryFilter === "all") return true;
    const expiryDate = new Date(row.expiry_date);
    expiryDate.setHours(0, 0, 0, 0);

    if (expiryFilter === "expired") return expiryDate < now;
    if (expiryFilter === "today") return expiryDate.getTime() === now.getTime();
    if (expiryFilter === "next_7_days") return expiryDate >= now && expiryDate <= plus7;
    if (expiryFilter === "next_30_days") return expiryDate >= now && expiryDate <= plus30;
    return true;
  });

  return NextResponse.json({ data: dateFiltered });
}








