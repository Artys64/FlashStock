import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizeRequest } from "@/lib/auth/guard";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { z } from "zod";
import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";

const createProductSchema = z.object({
  establishmentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  uom: z.string().min(1),
  minimumStock: z.number().nonnegative(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = createProductSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "inventory.write",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client
      .from("products")
      .insert({
        organization_id: payload.organizationId,
        category_id: payload.categoryId,
        sku: payload.sku,
        name: payload.name,
        uom: payload.uom,
        minimum_stock: payload.minimumStock,
      })
      .select()
      .single();

    if (error) return internalServerError();
    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: payload.establishmentId,
      entityType: "product",
      entityId: String((data as { id?: string } | null)?.id ?? ""),
      action: "product_created",
      actorUserId: auth.session.userId,
      payload: {
        organizationId: payload.organizationId,
        categoryId: payload.categoryId,
        sku: payload.sku,
        name: payload.name,
        uom: payload.uom,
        minimumStock: payload.minimumStock,
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}








