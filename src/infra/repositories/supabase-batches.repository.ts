import { BatchesRepository } from "@/core/ports/repositories";
import { Batch } from "@/core/domain/types";
import { SupabaseClient } from "@supabase/supabase-js";

function mapBatch(row: Record<string, unknown>): Batch {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    establishmentId: String(row.establishment_id),
    lotCode: String(row.lot_code),
    expiryDate: String(row.expiry_date),
    quantityCurrent: Number(row.quantity_current),
    costPrice: Number(row.cost_price),
    locationId: row.location_id ? String(row.location_id) : undefined,
    quarantined: Boolean(row.quarantined),
    version: Number(row.version),
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

export class SupabaseBatchesRepository implements BatchesRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(batch: Omit<Batch, "id" | "version">): Promise<Batch> {
    const { data, error } = await this.client
      .from("batches")
      .insert({
        establishment_id: batch.establishmentId,
        product_id: batch.productId,
        lot_code: batch.lotCode,
        expiry_date: batch.expiryDate,
        quantity_current: batch.quantityCurrent,
        cost_price: batch.costPrice,
        location_id: batch.locationId ?? null,
        quarantined: batch.quarantined,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapBatch(data);
  }

  async findById(id: string): Promise<Batch | null> {
    const { data, error } = await this.client
      .from("batches")
      .select("*")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapBatch(data) : null;
  }

  async listByProduct(productId: string, establishmentId: string): Promise<Batch[]> {
    const { data, error } = await this.client
      .from("batches")
      .select("*")
      .eq("product_id", productId)
      .eq("establishment_id", establishmentId)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapBatch);
  }

  async updateQuantity(batchId: string, quantityCurrent: number): Promise<void> {
    if (quantityCurrent < 0) throw new Error("Negative stock is not allowed.");

    const { data: currentBatch, error: findError } = await this.client
      .from("batches")
      .select("version")
      .eq("id", batchId)
      .is("archived_at", null)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!currentBatch) throw new Error("Batch not found.");

    const { data: updated, error } = await this.client
      .from("batches")
      .update({
        quantity_current: quantityCurrent,
        updated_at: new Date().toISOString(),
        version: Number(currentBatch.version) + 1,
      })
      .eq("id", batchId)
      .is("archived_at", null)
      .eq("version", Number(currentBatch.version))
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Optimistic concurrency conflict.");
  }
}
