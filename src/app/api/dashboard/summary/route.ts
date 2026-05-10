import { authorizeRequest } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";

function parseDaysLeft(expiryDate: string): number {
  const today = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
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
  const { data: batchRows, error: batchError } = await client
    .from("batches")
    .select("id, product_id, expiry_date, quantity_current, quarantined")
    .eq("establishment_id", establishmentId)
    .is("archived_at", null)
    .gt("quantity_current", 0);

  if (batchError) {
    return internalServerError();
  }

  const productIds = Array.from(
    new Set((batchRows ?? []).map((row) => String((row as Record<string, unknown>).product_id))),
  );

  if (productIds.length === 0) {
    return NextResponse.json({
      data: {
        critical: 0,
        warning: 0,
        replenishment: 0,
      },
    });
  }

  const { data: productRows, error: productError } = await client
    .from("products")
    .select("id, minimum_stock, category_id")
    .in("id", productIds);
  if (productError) {
    return internalServerError();
  }

  const categoryIds = Array.from(
    new Set((productRows ?? []).map((row) => String((row as Record<string, unknown>).category_id))),
  );

  const { data: categoryRows, error: categoryError } = await client
    .from("categories")
    .select("id, lead_time_alert_days")
    .in("id", categoryIds);
  if (categoryError) {
    return internalServerError();
  }

  let critical = 0;
  let warning = 0;
  const stockByProduct = new Map<string, { total: number; minimum: number }>();
  const categoryLeadTimeById = new Map<string, number>();
  const productById = new Map<string, { minimumStock: number; categoryId: string }>();

  for (const row of categoryRows ?? []) {
    const category = row as Record<string, unknown>;
    categoryLeadTimeById.set(
      String(category.id),
      Number(category.lead_time_alert_days),
    );
  }

  for (const row of productRows ?? []) {
    const product = row as Record<string, unknown>;
    productById.set(String(product.id), {
      minimumStock: Number(product.minimum_stock),
      categoryId: String(product.category_id),
    });
  }

  for (const row of batchRows ?? []) {
    const batch = row as Record<string, unknown>;
    const quarantined = Boolean(batch.quarantined);
    if (quarantined) continue;

    const daysLeft = parseDaysLeft(String(batch.expiry_date));
    const productId = String(batch.product_id);
    const product = productById.get(productId);
    if (!product) continue;
    const quantityCurrent = Number(batch.quantity_current);

    const existing = stockByProduct.get(productId);
    if (existing) {
      existing.total += quantityCurrent;
    } else {
      stockByProduct.set(productId, {
        total: quantityCurrent,
        minimum: product.minimumStock,
      });
    }
    const leadTimeAlertDays = categoryLeadTimeById.get(product.categoryId) ?? 0;

    if (daysLeft <= 0) {
      critical += 1;
    } else if (daysLeft <= leadTimeAlertDays) {
      warning += 1;
    }
  }

  const batchIds = Array.from(
    new Set((batchRows ?? []).map((row) => String((row as Record<string, unknown>).id))),
  );

  if (batchIds.length > 0) {
    const { data: snoozes } = await client
      .from("batch_alert_snoozes")
      .select("batch_id, snoozed_until")
      .eq("establishment_id", establishmentId)
      .in("batch_id", batchIds)
      .gt("snoozed_until", new Date().toISOString());

    const snoozedBatchIds = new Set(
      (snoozes ?? []).map((row) => String((row as Record<string, unknown>).batch_id)),
    );

    if (snoozedBatchIds.size > 0) {
      warning = 0;
      for (const row of batchRows ?? []) {
        const batch = row as Record<string, unknown>;
        if (Boolean(batch.quarantined)) continue;
        if (snoozedBatchIds.has(String(batch.id))) continue;
        const daysLeft = parseDaysLeft(String(batch.expiry_date));
        const product = productById.get(String(batch.product_id));
        if (!product) continue;
        const leadTimeAlertDays = categoryLeadTimeById.get(product.categoryId) ?? 0;
        if (daysLeft > 0 && daysLeft <= leadTimeAlertDays) {
          warning += 1;
        }
      }
    }
  }

  let replenishment = 0;
  for (const [, stock] of stockByProduct) {
    if (stock.total < stock.minimum) replenishment += 1;
  }

  return NextResponse.json({
    data: {
      critical,
      warning,
      replenishment,
    },
  });
}








