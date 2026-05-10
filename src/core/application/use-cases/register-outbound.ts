import { pickPvpsBatch, requiresReasonCodeForNonPvps, validateReasonCode } from "../../domain/rules";
import { ReasonCode } from "../../domain/types";
import { BatchesRepository, InventoryMovementsRepository } from "../../ports/repositories";

export interface RegisterOutboundInput {
  establishmentId: string;
  productId: string;
  quantity: number;
  selectedBatchId: string;
  reasonCode?: ReasonCode;
  actorUserId?: string;
  movementType: "exit_sale" | "exit_loss" | "adjustment";
}

export class RegisterOutboundUseCase {
  constructor(
    private readonly batchesRepository: BatchesRepository,
    private readonly movementsRepository: InventoryMovementsRepository,
  ) {}

  async execute(input: RegisterOutboundInput): Promise<void> {
    if (input.quantity <= 0) throw new Error("Outbound quantity must be greater than zero.");

    const [selectedBatch, productBatches] = await Promise.all([
      this.batchesRepository.findById(input.selectedBatchId),
      this.batchesRepository.listByProduct(input.productId, input.establishmentId),
    ]);

    if (!selectedBatch) throw new Error("Selected batch not found.");
    if (selectedBatch.quarantined) throw new Error("Cannot move stock from quarantine batch.");
    if (selectedBatch.quantityCurrent < input.quantity) throw new Error("Negative stock is not allowed.");

    const pvpsBatch = pickPvpsBatch(productBatches);
    const needsReasonCode = requiresReasonCodeForNonPvps(
      input.selectedBatchId,
      pvpsBatch?.id ?? null,
    );
    if (needsReasonCode) validateReasonCode(input.reasonCode);

    const newQuantity = selectedBatch.quantityCurrent - input.quantity;
    await this.batchesRepository.updateQuantity(selectedBatch.id, newQuantity);
    await this.movementsRepository.create({
      establishmentId: input.establishmentId,
      batchId: selectedBatch.id,
      productId: input.productId,
      movementType: input.movementType,
      quantity: input.quantity,
      unitCost: selectedBatch.costPrice,
      reasonCode: input.reasonCode,
      actorUserId: input.actorUserId,
    });
  }
}
