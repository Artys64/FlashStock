import { DomainError } from "../../domain/domain-error.ts";
import type { BatchesRepository, InventoryMovementsRepository } from "../../ports/repositories.ts";

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

    if (!this.movementsRepository.registerInboundAtomic) {
      throw new DomainError(
        "OPERATION_NOT_SUPPORTED",
        500,
        "Atomic inbound registration is required but not available in the current repository.",
      );
    }

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
}

