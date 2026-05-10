import { RegisterOutboundUseCase } from "@/core/application/use-cases/register-outbound";
import { SupabaseBatchesRepository } from "@/infra/repositories/supabase-batches.repository";
import { SupabaseInventoryMovementsRepository } from "@/infra/repositories/supabase-inventory-movements.repository";
import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";
import { authorizeRequest } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, unauthorized } from "@/lib/http/errors";
import { z } from "zod";

const outboundSchema = z.object({
  establishmentId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  selectedBatchId: z.string().uuid(),
  reasonCode: z
    .enum([
      "damaged_old_batch",
      "customer_specific_batch",
      "quality_issue",
      "manual_adjustment",
    ])
    .optional(),
  actorUserId: z.string().uuid().optional(),
  movementType: z.enum(["exit_sale", "exit_loss", "adjustment"]),
});

export async function POST(request: NextRequest) {
  try {
    const payload = outboundSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "movements.write",
    });
    if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const useCase = new RegisterOutboundUseCase(
      new SupabaseBatchesRepository(client),
      new SupabaseInventoryMovementsRepository(client),
    );
    await useCase.execute({
      ...payload,
      actorUserId: auth.session.userId,
    });
    await new SupabaseAuditLogsRepository(client).create({
      establishmentId: payload.establishmentId,
      entityType: "movement",
      entityId: payload.selectedBatchId,
      action: "outbound_registered",
      actorUserId: auth.session.userId,
      payload: {
        productId: payload.productId,
        selectedBatchId: payload.selectedBatchId,
        quantity: payload.quantity,
        movementType: payload.movementType,
        reasonCode: payload.reasonCode ?? null,
      },
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}








