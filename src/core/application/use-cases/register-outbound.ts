import {
  pickPvpsBatch,
  requiresReasonCodeForNonPvps,
  validateReasonCode,
} from "../../domain/rules.ts";
import { DomainError } from "../../domain/domain-error.ts";
import type { ReasonCode } from "../../domain/types.ts";
import type {
  BatchesRepository,
  InventoryMovementsRepository,
} from "../../ports/repositories.ts";
import { compareIsoDate, getTodayInOperationTimezone } from "../../../lib/time/business-date.ts";

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
  private readonly batchesRepository: BatchesRepository;
  private readonly movementsRepository: InventoryMovementsRepository;

  constructor(
    batchesRepository: BatchesRepository,
    movementsRepository: InventoryMovementsRepository,
  ) {
    this.batchesRepository = batchesRepository;
    this.movementsRepository = movementsRepository;
  }

  async execute(input: RegisterOutboundInput): Promise<void> {
    if (input.quantity <= 0) {
      throw new DomainError(
        "OUTBOUND_QUANTITY_MUST_BE_POSITIVE",
        422,
        "Outbound quantity must be greater than zero.",
      );
    }

    const [selectedBatch, productBatches] = await Promise.all([
      this.batchesRepository.findById(input.selectedBatchId),
      this.batchesRepository.listByProduct(input.productId, input.establishmentId),
    ]);

    if (!selectedBatch) throw new DomainError("BATCH_NOT_FOUND", 404, "Selected batch not found.");
    if (selectedBatch.establishmentId !== input.establishmentId) {
      throw new DomainError("BATCH_NOT_FOUND", 404, "Selected batch not found.");
    }
    if (selectedBatch.productId !== input.productId) {
      throw new DomainError(
        "BATCH_PRODUCT_MISMATCH",
        422,
        "Selected batch does not belong to the requested product.",
      );
    }
    if (selectedBatch.quarantined) {
      throw new DomainError(
        "BATCH_IN_QUARANTINE",
        422,
        "Cannot move stock from quarantine batch.",
      );
    }

    if (selectedBatch.quantityCurrent < input.quantity) {
      throw new DomainError("NEGATIVE_STOCK_NOT_ALLOWED", 422, "Negative stock is not allowed.");
    }

    const todayDateIso = getTodayInOperationTimezone();
    const isExpired = compareIsoDate(selectedBatch.expiryDate, todayDateIso) <= 0;
    if (input.movementType !== "exit_loss" && isExpired) {
      throw new DomainError(
        "EXPIRED_BATCH_NOT_ALLOWED_FOR_CONSUMPTION",
        422,
        "Cannot consume expired batch. Use explicit loss flow.",
      );
    }

    const pvpsBatch = pickPvpsBatch(productBatches, {
      allowExpired: input.movementType === "exit_loss",
      todayDateIso,
    });
    const needsReasonCode = requiresReasonCodeForNonPvps(
      input.selectedBatchId,
      pvpsBatch?.id ?? null,
    );
    if (needsReasonCode) {
      try {
        validateReasonCode(input.reasonCode);
      } catch {
        throw new DomainError(
          "PVPS_OVERRIDE_REASON_REQUIRED",
          422,
          "Reason code is required when bypassing PVPS suggestion.",
        );
      }
    }

    if (!this.movementsRepository.registerOutboundAtomic) {
      throw new DomainError(
        "OPERATION_NOT_SUPPORTED",
        500,
        "Atomic outbound registration is required but not available in the current repository.",
      );
    }

    await this.movementsRepository.registerOutboundAtomic({
      establishmentId: input.establishmentId,
      productId: input.productId,
      selectedBatchId: selectedBatch.id,
      quantity: input.quantity,
      movementType: input.movementType,
      reasonCode: input.reasonCode,
      actorUserId: input.actorUserId,
    });
  }
}

