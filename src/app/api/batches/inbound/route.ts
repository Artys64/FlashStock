import { RegisterInboundUseCase } from "@/core/application/use-cases/register-inbound";
import { SupabaseBatchesRepository } from "@/infra/repositories/supabase-batches.repository";
import { SupabaseInventoryMovementsRepository } from "@/infra/repositories/supabase-inventory-movements.repository";
import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";
import { authorizeRequest } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, unauthorized } from "@/lib/http/errors";
import { z } from "zod";

const inboundSchema = z.object({
  establishmentId: z.string().uuid(),
  productId: z.string().uuid(),
  lotCode: z.string().min(1),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive(),
  costPrice: z.number().nonnegative(),
  locationId: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = inboundSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "movements.write",
    });
    if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const useCase = new RegisterInboundUseCase(
      new SupabaseBatchesRepository(client),
      new SupabaseInventoryMovementsRepository(client),
    );
    const result = await useCase.execute({
      ...payload,
      actorUserId: auth.session.userId,
    });
    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: payload.establishmentId,
      entityType: "movement",
      entityId: result.batchId,
      action: "inbound_registered",
      actorUserId: auth.session.userId,
      payload: {
        productId: payload.productId,
        lotCode: payload.lotCode,
        expiryDate: payload.expiryDate,
        quantity: payload.quantity,
        costPrice: payload.costPrice,
        locationId: payload.locationId ?? null,
      },
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}








