import { pickPvpsBatch } from "@/core/domain/rules";
import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  const productId = request.nextUrl.searchParams.get("productId");

  if (!establishmentId || !productId) {
    return badRequest("Missing establishmentId or productId query param.");
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
    .from("batches")
    .select("id, product_id, establishment_id, lot_code, expiry_date, quantity_current, cost_price, location_id, quarantined, version")
    .eq("establishment_id", establishmentId)
    .eq("product_id", productId)
    .is("archived_at", null);

  if (error) return internalServerError();

  const batches = (data ?? []).map((row) => {
    const typed = row as Record<string, unknown>;
    return {
      id: String(typed.id),
      productId: String(typed.product_id),
      establishmentId: String(typed.establishment_id),
      lotCode: String(typed.lot_code),
      expiryDate: String(typed.expiry_date),
      quantityCurrent: Number(typed.quantity_current),
      costPrice: Number(typed.cost_price),
      locationId: typed.location_id ? String(typed.location_id) : undefined,
      quarantined: Boolean(typed.quarantined),
      version: Number(typed.version),
    };
  });

  const suggested = pickPvpsBatch(batches);
  const alternatives = batches
    .filter((batch) => batch.id !== suggested?.id && !batch.quarantined && batch.quantityCurrent > 0)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
    .slice(0, 5)
    .map((batch) => ({
      batchId: batch.id,
      expiryDate: batch.expiryDate,
      quantity: batch.quantityCurrent,
    }));

  return NextResponse.json({
    data: suggested
      ? {
          suggestedBatchId: suggested.id,
          expiryDate: suggested.expiryDate,
          availableQuantity: suggested.quantityCurrent,
          alternatives,
        }
      : {
          suggestedBatchId: null,
          expiryDate: null,
          availableQuantity: 0,
          alternatives,
        },
  });
}
