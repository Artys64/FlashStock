import { Batch, InventoryMovement, Product } from "../domain/types";

export interface ProductsRepository {
  findById(id: string): Promise<Product | null>;
}

export interface BatchesRepository {
  create(batch: Omit<Batch, "id" | "version">): Promise<Batch>;
  findById(id: string): Promise<Batch | null>;
  listByProduct(productId: string, establishmentId: string): Promise<Batch[]>;
  updateQuantity(batchId: string, quantityCurrent: number): Promise<void>;
}

export interface InventoryMovementsRepository {
  create(movement: Omit<InventoryMovement, "id" | "createdAt">): Promise<void>;
}
