import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../domain/domain-error";
import type { Batch, InventoryMovement } from "../../domain/types";
import type { BatchesRepository, InventoryMovementsRepository } from "../../ports/repositories";
import { RegisterOutboundUseCase } from "./register-outbound";

class InMemoryBatchesRepository implements BatchesRepository {
  private readonly batches: Batch[];

  constructor(batches: Batch[]) {
    this.batches = batches;
  }

  async create(batch: Omit<Batch, "id" | "version">): Promise<Batch> {
    void batch;
    throw new Error("Not implemented.");
  }

  async findById(id: string): Promise<Batch | null> {
    return this.batches.find((batch) => batch.id === id) ?? null;
  }

  async listByProduct(productId: string, establishmentId: string): Promise<Batch[]> {
    return this.batches.filter(
      (batch) => batch.productId === productId && batch.establishmentId === establishmentId,
    );
  }

  async updateQuantity(batchId: string, quantityCurrent: number): Promise<void> {
    const batch = this.batches.find((candidate) => candidate.id === batchId);
    if (!batch) throw new Error("Batch not found.");
    batch.quantityCurrent = quantityCurrent;
  }
}

class InMemoryMovementsRepository implements InventoryMovementsRepository {
  public readonly movements: Omit<InventoryMovement, "id" | "createdAt">[] = [];
  public atomicCalls = 0;

  async create(movement: Omit<InventoryMovement, "id" | "createdAt">): Promise<void> {
    this.movements.push(movement);
  }

  async registerOutboundAtomic(): Promise<void> {
    this.atomicCalls += 1;
  }
}

function makeBatch(input: Partial<Batch>): Batch {
  return {
    id: input.id ?? "batch-1",
    productId: input.productId ?? "product-1",
    establishmentId: input.establishmentId ?? "establishment-1",
    lotCode: input.lotCode ?? "L1",
    expiryDate: input.expiryDate ?? "2026-12-31",
    quantityCurrent: input.quantityCurrent ?? 10,
    costPrice: input.costPrice ?? 9.5,
    locationId: input.locationId,
    quarantined: input.quarantined ?? false,
    version: input.version ?? 1,
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

test("rejects outbound when selected batch does not belong to requested product", async () => {
  const batches = new InMemoryBatchesRepository([
    makeBatch({ id: "batch-1", productId: "product-other" }),
  ]);
  const movements = new InMemoryMovementsRepository();
  const useCase = new RegisterOutboundUseCase(batches, movements);

  await assert.rejects(
    () =>
      useCase.execute({
        establishmentId: "establishment-1",
        productId: "product-1",
        quantity: 1,
        selectedBatchId: "batch-1",
        movementType: "exit_sale",
      }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "BATCH_PRODUCT_MISMATCH",
  );
});

test("rejects regular outbound when batch is expired", async () => {
  const batches = new InMemoryBatchesRepository([
    makeBatch({ id: "batch-1", expiryDate: "2026-05-01", quantityCurrent: 5 }),
  ]);
  const movements = new InMemoryMovementsRepository();
  const useCase = new RegisterOutboundUseCase(batches, movements);

  await assert.rejects(
    () =>
      useCase.execute({
        establishmentId: "establishment-1",
        productId: "product-1",
        quantity: 1,
        selectedBatchId: "batch-1",
        movementType: "exit_sale",
      }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "EXPIRED_BATCH_NOT_ALLOWED_FOR_CONSUMPTION",
  );
});

test("allows loss outbound for expired batch and uses atomic path when available", async () => {
  const batches = new InMemoryBatchesRepository([
    makeBatch({ id: "batch-1", expiryDate: "2026-05-01", quantityCurrent: 5 }),
  ]);
  const movements = new InMemoryMovementsRepository();
  const useCase = new RegisterOutboundUseCase(batches, movements);

  await useCase.execute({
    establishmentId: "establishment-1",
    productId: "product-1",
    quantity: 1,
    selectedBatchId: "batch-1",
    movementType: "exit_loss",
  });

  assert.equal(movements.atomicCalls, 1);
  assert.equal(movements.movements.length, 0);
});

