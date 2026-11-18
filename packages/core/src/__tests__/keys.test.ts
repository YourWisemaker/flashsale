import { describe, expect, it } from "vitest";
import {
  ORDER_JOB_OPTIONS,
  ORDER_QUEUE_NAME,
  orderJobId,
  SALE_BUYERS_KEY,
  SALE_CONFIG_KEY,
  SALE_STOCK_KEY,
} from "../keys.js";

describe("key names", () => {
  // Pinned on purpose: these are what's already sitting in a running
  // Redis. Renaming one silently orphans live sale data and queued jobs.
  it("are stable", () => {
    expect([SALE_CONFIG_KEY, SALE_STOCK_KEY, SALE_BUYERS_KEY, ORDER_QUEUE_NAME]).toEqual([
      "sale:config",
      "sale:stock",
      "sale:buyers",
      "orders",
    ]);
  });
});

describe("orderJobId", () => {
  it("is deterministic per user, so enqueue stays idempotent", () => {
    expect(orderJobId("arief")).toBe(orderJobId("arief"));
    expect(orderJobId("arief")).not.toBe(orderJobId("boss"));
  });

  it("never produces an id that parses as an integer (BullMQ rejects those)", () => {
    const id = orderJobId("12345");
    expect(`${parseInt(id, 10)}`).not.toBe(id);
  });
});

describe("ORDER_JOB_OPTIONS", () => {
  it("removes completed jobs so a returning user in a later sale is enqueued again", () => {
    expect(ORDER_JOB_OPTIONS.removeOnComplete).toBe(true);
  });

  it("keeps failed jobs, because the failed set is the DLQ", () => {
    expect(ORDER_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(ORDER_JOB_OPTIONS.attempts).toBe(5);
    expect(ORDER_JOB_OPTIONS.backoff).toEqual({ type: "exponential", delay: 500 });
  });
});
