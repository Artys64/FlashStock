import { compareIsoDate, getTodayInOperationTimezone } from "@/lib/time/business-date";

export function isExpired(expiryDate: string, now = new Date()): boolean {
  const todayDateIso = getTodayInOperationTimezone(now);
  return compareIsoDate(expiryDate, todayDateIso) <= 0;
}

export function computeSnoozedUntil(hours: 24 | 48, now = new Date()): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function parseSnoozeHours(input: unknown): 24 | 48 | null {
  if (input === 24 || input === 48) return input;
  return null;
}
