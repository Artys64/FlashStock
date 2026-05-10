import { InventoryMovement } from "@/core/domain/types";
import { DomainError } from "@/core/domain/domain-error";
import { InventoryMovementsRepository } from "@/core/ports/repositories";
import { SupabaseClient } from "@supabase/supabase-js";

export class SupabaseInventoryMovementsRepository
  implements InventoryMovementsRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async create(movement: Omit<InventoryMovement, "id" | "createdAt">): Promise<void> {
    const { error } = await this.client.from("inventory_movements").insert({
      establishment_id: movement.establishmentId,
      batch_id: movement.batchId,
      product_id: movement.productId,
      movement_type: movement.movementType,
      quantity: movement.quantity,
      unit_cost: movement.unitCost,
      reason_code: movement.reasonCode ?? null,
      actor_user_id: movement.actorUserId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async registerInboundAtomic(input: {
    establishmentId: string;
    productId: string;
    lotCode: string;
    expiryDate: string;
    quantity: number;
    costPrice?: number;
    locationId?: string;
    actorUserId?: string;
  }): Promise<{ batchId: string }> {
    const { data, error } = await this.client.rpc("register_inbound_movement", {
      target_establishment_id: input.establishmentId,
      target_product_id: input.productId,
      target_lot_code: input.lotCode,
      target_expiry_date: input.expiryDate,
      target_quantity: input.quantity,
      target_cost_price: input.costPrice ?? 0,
      target_location_id: input.locationId ?? null,
      target_actor_user_id: input.actorUserId ?? null,
    });

    if (error) {
      if (error.message.includes("INBOUND_FORBIDDEN")) {
        throw new DomainError("FORBIDDEN", 403, "Forbidden.");
      }
      if (error.message.includes("UNAUTHENTICATED")) {
        throw new DomainError("UNAUTHORIZED", 401, "Unauthorized.");
      }
      if (error.message.includes("INBOUND_PRODUCT_TENANT_MISMATCH")) {
        throw new DomainError(
          "PRODUCT_TENANT_MISMATCH",
          422,
          "Product does not belong to the establishment organization.",
        );
      }
      if (error.message.includes("duplicate key")) {
        throw new DomainError(
          "BATCH_LOT_CODE_ALREADY_EXISTS",
          409,
          "Lot code already exists for this establishment.",
        );
      }
      throw new Error(error.message);
    }

    const row = (Array.isArray(data) ? data[0] : data) as { batch_id?: string } | null;
    const batchId = row?.batch_id ? String(row.batch_id) : "";
    if (!batchId) throw new Error("Could not register inbound movement.");
    return { batchId };
  }

  async registerOutboundAtomic(input: {
    establishmentId: string;
    productId: string;
    selectedBatchId: string;
    quantity: number;
    movementType: "exit_sale" | "exit_loss" | "adjustment";
    reasonCode?: InventoryMovement["reasonCode"];
    actorUserId?: string;
  }): Promise<void> {
    const { error } = await this.client.rpc("register_outbound_movement", {
      target_establishment_id: input.establishmentId,
      target_product_id: input.productId,
      target_batch_id: input.selectedBatchId,
      target_quantity: input.quantity,
      target_movement_type: input.movementType,
      target_reason_code: input.reasonCode ?? null,
      target_actor_user_id: input.actorUserId ?? null,
    });

    if (!error) return;
    if (error.message.includes("OUTBOUND_FORBIDDEN")) {
      throw new DomainError("FORBIDDEN", 403, "Forbidden.");
    }
    if (error.message.includes("UNAUTHENTICATED")) {
      throw new DomainError("UNAUTHORIZED", 401, "Unauthorized.");
    }
    if (error.message.includes("OUTBOUND_BATCH_NOT_FOUND")) {
      throw new DomainError("BATCH_NOT_FOUND", 404, "Selected batch not found.");
    }
    if (error.message.includes("OUTBOUND_BATCH_QUARANTINED")) {
      throw new DomainError(
        "BATCH_IN_QUARANTINE",
        422,
        "Cannot move stock from quarantine batch.",
      );
    }
    if (error.message.includes("OUTBOUND_INSUFFICIENT_STOCK")) {
      throw new DomainError("NEGATIVE_STOCK_NOT_ALLOWED", 422, "Negative stock is not allowed.");
    }
    if (error.message.includes("OUTBOUND_EXPIRED_NOT_ALLOWED")) {
      throw new DomainError(
        "EXPIRED_BATCH_NOT_ALLOWED_FOR_CONSUMPTION",
        422,
        "Cannot consume expired batch. Use explicit loss flow.",
      );
    }
    throw new Error(error.message);
  }
}
