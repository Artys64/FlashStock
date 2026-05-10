export const OPERATION_TIMEZONE = "America/Sao_Paulo";

function toIsoDateFromParts(parts: Intl.DateTimeFormatPart[]): string {
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Could not resolve date parts.");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(dateIso: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) {
    throw new Error(`Invalid date format: ${dateIso}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function getTodayInOperationTimezone(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return toIsoDateFromParts(formatter.formatToParts(now));
}

export function compareIsoDate(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function diffDaysIsoDate(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((toUtc - fromUtc) / oneDayMs);
}
