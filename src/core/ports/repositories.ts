import type { Batch, InventoryMovement, Product } from "../domain/types";

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
  registerInboundAtomic?(input: {
    establishmentId: string;
    productId: string;
    lotCode: string;
    expiryDate: string;
    quantity: number;
    costPrice?: number;
    locationId?: string;
    actorUserId?: string;
  }): Promise<{ batchId: string }>;
  registerOutboundAtomic?(input: {
    establishmentId: string;
    productId: string;
    selectedBatchId: string;
    quantity: number;
    movementType: "exit_sale" | "exit_loss" | "adjustment";
    reasonCode?: InventoryMovement["reasonCode"];
    actorUserId?: string;
  }): Promise<void>;
}

