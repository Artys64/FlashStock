import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (!establishmentId || !from || !to) {
    return badRequest("Missing establishmentId, from or to query param.");
  }

  const auth = await authorizeRequest({
    request,
    establishmentId,
    permission: "movements.read",
  });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });

  const { data, error } = await client
    .from("inventory_movements")
    .select("id, product_id, quantity, unit_cost, created_at")
    .eq("establishment_id", establishmentId)
    .eq("movement_type", "exit_loss")
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lte("created_at", `${to}T23:59:59.999Z`);

  if (error) return internalServerError();

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const productIds = Array.from(new Set(rows.map((row) => String(row.product_id))));

  const { data: productRows, error: productError } = await client
    .from("products")
    .select("id, name, category_id")
    .in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);

  if (productError) return internalServerError();

  const { data: categories, error: categoriesError } = await client
    .from("categories")
    .select("id, name");
  if (categoriesError) return internalServerError();

  const productMap = new Map<string, { name: string; categoryId: string }>();
  for (const row of productRows ?? []) {
    const p = row as Record<string, unknown>;
    productMap.set(String(p.id), {
      name: String(p.name),
      categoryId: String(p.category_id),
    });
  }

  const categoryMap = new Map<string, string>();
  for (const row of categories ?? []) {
    const c = row as Record<string, unknown>;
    categoryMap.set(String(c.id), String(c.name));
  }

  let totalLossValue = 0;
  const byProduct = new Map<string, { productId: string; productName: string; value: number }>();
  const byCategory = new Map<string, { categoryId: string; categoryName: string; value: number }>();

  for (const row of rows) {
    const productId = String(row.product_id);
    const product = productMap.get(productId);
    if (!product) continue;

    const lossValue = Number(row.quantity) * Number(row.unit_cost);
    totalLossValue += lossValue;

    const currentProduct = byProduct.get(productId) ?? {
      productId,
      productName: product.name,
      value: 0,
    };
    currentProduct.value += lossValue;
    byProduct.set(productId, currentProduct);

    const categoryName = categoryMap.get(product.categoryId) ?? "Sem categoria";
    const currentCategory = byCategory.get(product.categoryId) ?? {
      categoryId: product.categoryId,
      categoryName,
      value: 0,
    };
    currentCategory.value += lossValue;
    byCategory.set(product.categoryId, currentCategory);
  }

  return NextResponse.json({
    data: {
      totalLossValue,
      totalMovements: rows.length,
      byProduct: Array.from(byProduct.values()).sort((a, b) => b.value - a.value),
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.value - a.value),
    },
  });
}
