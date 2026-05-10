const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const BACKOFF_SCHEDULE_MS = [15 * MINUTE_MS, 1 * HOUR_MS, 6 * HOUR_MS, 24 * HOUR_MS] as const;
export const MAX_EMAIL_RETRY_ATTEMPTS = BACKOFF_SCHEDULE_MS.length + 1;

export function computeNextRetryAt(input: {
  failedAttempts: number;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const index = input.failedAttempts - 1;
  if (index < 0) return now.toISOString();
  if (index >= BACKOFF_SCHEDULE_MS.length) return null;
  return new Date(now.getTime() + BACKOFF_SCHEDULE_MS[index]).toISOString();
}
