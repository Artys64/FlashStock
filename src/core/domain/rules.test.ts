import assert from "node:assert/strict";
import test from "node:test";
import { computeBatchStatus, pickPvpsBatch } from "./rules.ts";

test("pickPvpsBatch ignores quarantined, zero quantity and expired for regular flow", () => {
  const result = pickPvpsBatch(
    [
      {
        id: "1",
        productId: "p1",
        establishmentId: "e1",
        lotCode: "L1",
        expiryDate: "2026-05-01",
        quantityCurrent: 5,
        costPrice: 10,
        quarantined: false,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        productId: "p1",
        establishmentId: "e1",
        lotCode: "L2",
        expiryDate: "2026-05-20",
        quantityCurrent: 0,
        costPrice: 10,
        quarantined: false,
        version: 1,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "3",
        productId: "p1",
        establishmentId: "e1",
        lotCode: "L3",
        expiryDate: "2026-05-15",
        quantityCurrent: 8,
        costPrice: 10,
        quarantined: true,
        version: 1,
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "4",
        productId: "p1",
        establishmentId: "e1",
        lotCode: "L4",
        expiryDate: "2026-05-11",
        quantityCurrent: 8,
        costPrice: 10,
        quarantined: false,
        version: 1,
        createdAt: "2026-01-04T00:00:00.000Z",
      },
    ],
    { todayDateIso: "2026-05-10" },
  );

  assert.equal(result?.id, "4");
});

test("pickPvpsBatch resolves tie by created_at then id", () => {
  const result = pickPvpsBatch(
    [
      {
        id: "b",
        productId: "p1",
        establishmentId: "e1",
        lotCode: "L1",
        expiryDate: "2026-06-01",
        quantityCurrent: 5,
        costPrice: 10,
        quarantined: false,
        version: 1,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "a",
        productId: "p1",
        establishmentId: "e1",
        lotCode: "L2",
        expiryDate: "2026-06-01",
        quantityCurrent: 5,
        costPrice: 10,
        quarantined: false,
        version: 1,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "c",
        productId: "p1",
        establishmentId: "e1",
        lotCode: "L3",
        expiryDate: "2026-06-01",
        quantityCurrent: 5,
        costPrice: 10,
        quarantined: false,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    { todayDateIso: "2026-05-01" },
  );

  assert.equal(result?.id, "c");
});

test("computeBatchStatus marks expired with date boundary in operation day", () => {
  const status = computeBatchStatus({
    batch: {
      expiryDate: "2026-05-10",
      quantityCurrent: 3,
      quarantined: false,
    },
    leadTimeAlertDays: 7,
    todayDateIso: "2026-05-10",
  });

  assert.equal(status, "expired");
});

test("computeBatchStatus marks zero-quantity expired batch as expired, not active", () => {
  const status = computeBatchStatus({
    batch: {
      expiryDate: "2026-05-01",
      quantityCurrent: 0,
      quarantined: false,
    },
    leadTimeAlertDays: 7,
    todayDateIso: "2026-05-10",
  });

  assert.equal(status, "expired");
});

test("computeBatchStatus marks zero-quantity alert batch as alert, not active", () => {
  const status = computeBatchStatus({
    batch: {
      expiryDate: "2026-05-14",
      quantityCurrent: 0,
      quarantined: false,
    },
    leadTimeAlertDays: 7,
    todayDateIso: "2026-05-10",
  });

  assert.equal(status, "alert");
});

test("computeBatchStatus marks zero-quantity valid batch as active", () => {
  const status = computeBatchStatus({
    batch: {
      expiryDate: "2026-06-01",
      quantityCurrent: 0,
      quarantined: false,
    },
    leadTimeAlertDays: 7,
    todayDateIso: "2026-05-10",
  });

  assert.equal(status, "active");
});

