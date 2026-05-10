import { BatchesRepository, InventoryMovementsRepository } from "../../ports/repositories";

export interface RegisterInboundInput {
  establishmentId: string;
  productId: string;
  lotCode: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  locationId?: string;
  actorUserId?: string;
}

export class RegisterInboundUseCase {
  constructor(
    private readonly batchesRepository: BatchesRepository,
    private readonly movementsRepository: InventoryMovementsRepository,
  ) {}

  async execute(input: RegisterInboundInput): Promise<{ batchId: string }> {
    if (input.quantity <= 0) throw new Error("Inbound quantity must be greater than zero.");

    const batch = await this.batchesRepository.create({
      establishmentId: input.establishmentId,
      productId: input.productId,
      lotCode: input.lotCode,
      expiryDate: input.expiryDate,
      quantityCurrent: input.quantity,
      costPrice: input.costPrice,
      locationId: input.locationId,
      quarantined: false,
    });

    await this.movementsRepository.create({
      establishmentId: input.establishmentId,
      batchId: batch.id,
      productId: input.productId,
      movementType: "entry_purchase",
      quantity: input.quantity,
      unitCost: input.costPrice,
      actorUserId: input.actorUserId,
    });

    return { batchId: batch.id };
  }
}
