import { Batch, BatchStatus, ReasonCode } from "./types";

export function pickPvpsBatch(batches: Batch[]): Batch | null {
  const eligible = batches
    .filter((batch) => !batch.quarantined && batch.quantityCurrent > 0)
    .sort(
      (a, b) =>
        new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    );

  return eligible[0] ?? null;
}

export function requiresReasonCodeForNonPvps(
  selectedBatchId: string,
  suggestedPvpsBatchId: string | null,
): boolean {
  if (!suggestedPvpsBatchId) return false;
  return selectedBatchId !== suggestedPvpsBatchId;
}

export function validateReasonCode(reasonCode?: ReasonCode): void {
  if (!reasonCode) {
    throw new Error("Reason code is required when bypassing PVPS suggestion.");
  }
}

export function computeBatchStatus(input: {
  batch: Pick<Batch, "expiryDate" | "quantityCurrent" | "quarantined">;
  leadTimeAlertDays: number;
  now?: Date;
}): BatchStatus {
  const { batch, leadTimeAlertDays, now = new Date() } = input;
  if (batch.quarantined) return "quarantine";
  if (batch.quantityCurrent <= 0) return "active";

  const expiryDate = new Date(batch.expiryDate);
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntilExpiry <= 0) return "expired";
  if (daysUntilExpiry <= leadTimeAlertDays) return "alert";
  return "active";
}
