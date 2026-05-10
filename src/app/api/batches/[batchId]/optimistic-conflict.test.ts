import assert from "node:assert/strict";
import test from "node:test";
import { buildConflictPayload, buildMergedUpdate } from "./optimistic-conflict.ts";

test("buildConflictPayload returns field diffs for changed fields", () => {
  const result = buildConflictPayload({
    entityId: "batch-1",
    expectedVersion: 2,
    currentVersion: 3,
    clientChanges: {
      quarantined: true,
      expiryDate: "2026-05-20",
    },
    serverState: {
      quarantined: false,
      expiryDate: "2026-05-18",
    },
  });

  assert.equal(result.fieldDiff.length, 2);
  assert.deepEqual(result.fieldDiff[0], {
    field: "quarantined",
    clientValue: true,
    serverValue: false,
  });
  assert.deepEqual(result.fieldDiff[1], {
    field: "expiryDate",
    clientValue: "2026-05-20",
    serverValue: "2026-05-18",
  });
});

test("buildMergedUpdate keeps client values for client_wins", () => {
  const result = buildMergedUpdate({
    clientChanges: { quarantined: true, expiryDate: "2026-05-21" },
    merge: { strategy: "client_wins" },
  });

  assert.deepEqual(result, { quarantined: true, expiryDate: "2026-05-21" });
});

test("buildMergedUpdate resolves fields for field_level", () => {
  const result = buildMergedUpdate({
    clientChanges: { quarantined: true, expiryDate: "2026-05-21" },
    merge: {
      strategy: "field_level",
      resolved: { quarantined: false },
    },
  });

  assert.deepEqual(result, { quarantined: false, expiryDate: "2026-05-21" });
});
