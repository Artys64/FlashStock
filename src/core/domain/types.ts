export type BatchStatus = "active" | "alert" | "expired" | "quarantine";

export type MovementType =
  | "entry_purchase"
  | "exit_sale"
  | "exit_loss"
  | "adjustment";

export type ReasonCode =
  | "damaged_old_batch"
  | "customer_specific_batch"
  | "quality_issue"
  | "manual_adjustment";

export interface Product {
  id: string;
  organizationId: string;
  categoryId: string;
  sku: string;
  name: string;
  uom: string;
  minimumStock: number;
}

export interface Batch {
  id: string;
  productId: string;
  establishmentId: string;
  lotCode: string;
  expiryDate: string;
  quantityCurrent: number;
  costPrice: number;
  locationId?: string;
  quarantined: boolean;
  version: number;
  createdAt?: string;
}

export interface Category {
  id: string;
  organizationId: string;
  name: string;
  leadTimeAlertDays: number;
}

export interface InventoryMovement {
  id: string;
  establishmentId: string;
  batchId: string;
  productId: string;
  movementType: MovementType;
  quantity: number;
  unitCost: number;
  reasonCode?: ReasonCode;
  actorUserId?: string;
  createdAt: string;
}
