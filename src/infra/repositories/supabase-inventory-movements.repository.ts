import { InventoryMovement } from "@/core/domain/types";
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
}
