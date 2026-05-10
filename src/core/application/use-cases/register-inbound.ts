import { DomainError } from "../../domain/domain-error";
import type { BatchesRepository, InventoryMovementsRepository } from "../../ports/repositories";

export interface RegisterInboundInput {
  establishmentId: string;
  productId: string;
  lotCode: string;
  expiryDate: string;
  quantity: number;
  costPrice?: number;
  locationId?: string;
  actorUserId?: string;
}

export class RegisterInboundUseCase {
  private readonly batchesRepository: BatchesRepository;
  private readonly movementsRepository: InventoryMovementsRepository;

  constructor(
    batchesRepository: BatchesRepository,
    movementsRepository: InventoryMovementsRepository,
  ) {
    this.batchesRepository = batchesRepository;
    this.movementsRepository = movementsRepository;
  }

  async execute(input: RegisterInboundInput): Promise<{ batchId: string }> {
    if (input.quantity <= 0) {
      throw new DomainError(
        "INBOUND_QUANTITY_MUST_BE_POSITIVE",
        422,
        "Inbound quantity must be greater than zero.",
      );
    }
    const normalizedCostPrice = input.costPrice ?? 0;

    if (this.movementsRepository.registerInboundAtomic) {
      return this.movementsRepository.registerInboundAtomic({
        establishmentId: input.establishmentId,
        productId: input.productId,
        lotCode: input.lotCode,
        expiryDate: input.expiryDate,
        quantity: input.quantity,
        costPrice: normalizedCostPrice,
        locationId: input.locationId,
        actorUserId: input.actorUserId,
      });
    }

    const batch = await this.batchesRepository.create({
      establishmentId: input.establishmentId,
      productId: input.productId,
      lotCode: input.lotCode,
      expiryDate: input.expiryDate,
      quantityCurrent: input.quantity,
      costPrice: normalizedCostPrice,
      locationId: input.locationId,
      quarantined: false,
    });

    await this.movementsRepository.create({
      establishmentId: input.establishmentId,
      batchId: batch.id,
      productId: input.productId,
      movementType: "entry_purchase",
      quantity: input.quantity,
      unitCost: normalizedCostPrice,
      actorUserId: input.actorUserId,
    });

    return { batchId: batch.id };
  }
}

