import assert from "node:assert/strict";
import test from "node:test";
import { resolveAutoMilestones, shouldTriggerAlertMilestone } from "./notification-rules";

test("resolveAutoMilestones returns long-range profile for 180+ days", () => {
  assert.deepEqual(resolveAutoMilestones(180), [30, 15, 7, 1]);
  assert.deepEqual(resolveAutoMilestones(365), [30, 15, 7, 1]);
});

test("resolveAutoMilestones returns medium profile for 61-179 days", () => {
  assert.deepEqual(resolveAutoMilestones(61), [15, 7, 3, 1]);
  assert.deepEqual(resolveAutoMilestones(179), [15, 7, 3, 1]);
});

test("resolveAutoMilestones returns short profile for up to 60 days", () => {
  assert.deepEqual(resolveAutoMilestones(60), [7, 3, 1]);
  assert.deepEqual(resolveAutoMilestones(30), [7, 3, 1]);
  assert.deepEqual(resolveAutoMilestones(0), [7, 3, 1]);
});

test("shouldTriggerAlertMilestone only triggers on configured day marks", () => {
  assert.equal(
    shouldTriggerAlertMilestone({
      daysUntilExpiry: 30,
      totalShelfLifeDays: 200,
    }),
    true,
  );
  assert.equal(
    shouldTriggerAlertMilestone({
      daysUntilExpiry: 14,
      totalShelfLifeDays: 120,
    }),
    false,
  );
  assert.equal(
    shouldTriggerAlertMilestone({
      daysUntilExpiry: 0,
      totalShelfLifeDays: 120,
    }),
    false,
  );
});
