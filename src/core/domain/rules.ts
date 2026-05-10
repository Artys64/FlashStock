import type { Batch, BatchStatus, ReasonCode } from "./types";
import {
  compareIsoDate,
  diffDaysIsoDate,
  getTodayInOperationTimezone,
} from "../../lib/time/business-date";

export function pickPvpsBatch(
  batches: Batch[],
  options?: { allowExpired?: boolean; todayDateIso?: string },
): Batch | null {
  const allowExpired = options?.allowExpired ?? false;
  const todayDateIso = options?.todayDateIso ?? getTodayInOperationTimezone();
  const eligible = batches
    .filter((batch) => {
      if (batch.quarantined) return false;
      if (batch.quantityCurrent <= 0) return false;
      if (!allowExpired && compareIsoDate(batch.expiryDate, todayDateIso) <= 0) return false;
      return true;
    })
    .sort(
      (a, b) =>
        compareIsoDate(a.expiryDate, b.expiryDate) ||
        compareIsoDate(a.createdAt ?? "1970-01-01T00:00:00.000Z", b.createdAt ?? "1970-01-01T00:00:00.000Z") ||
        a.id.localeCompare(b.id),
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
  todayDateIso?: string;
}): BatchStatus {
  const { batch, leadTimeAlertDays } = input;
  const todayDateIso = input.todayDateIso ?? getTodayInOperationTimezone();
  if (batch.quarantined) return "quarantine";
  if (batch.quantityCurrent <= 0) return "active";
  const daysUntilExpiry = diffDaysIsoDate(todayDateIso, batch.expiryDate);

  if (daysUntilExpiry <= 0) return "expired";
  if (daysUntilExpiry <= leadTimeAlertDays) return "alert";
  return "active";
}

