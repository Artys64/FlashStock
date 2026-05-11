import assert from "node:assert/strict";
import test from "node:test";
import { computeNextRetryAt, MAX_EMAIL_RETRY_ATTEMPTS } from "./retry-policy";

test("computeNextRetryAt applies escalating backoff", () => {
  const base = new Date("2026-05-10T12:00:00.000Z");
  assert.equal(
    computeNextRetryAt({ failedAttempts: 1, now: base }),
    "2026-05-10T12:15:00.000Z",
  );
  assert.equal(
    computeNextRetryAt({ failedAttempts: 2, now: base }),
    "2026-05-10T13:00:00.000Z",
  );
  assert.equal(
    computeNextRetryAt({ failedAttempts: 3, now: base }),
    "2026-05-10T18:00:00.000Z",
  );
  assert.equal(
    computeNextRetryAt({ failedAttempts: 4, now: base }),
    "2026-05-11T12:00:00.000Z",
  );
});

test("computeNextRetryAt returns null after max retries", () => {
  assert.equal(computeNextRetryAt({ failedAttempts: MAX_EMAIL_RETRY_ATTEMPTS }), null);
  assert.equal(computeNextRetryAt({ failedAttempts: MAX_EMAIL_RETRY_ATTEMPTS + 1 }), null);
});
