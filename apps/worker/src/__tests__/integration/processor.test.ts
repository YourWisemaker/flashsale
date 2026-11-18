import type { Job } from "bullmq";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processOrderJob } from "../../processor.js";
import { setupWorkerTest } from "./test-helpers.js";

const ctx = await setupWorkerTest();

afterAll(ctx.teardown);
beforeEach(ctx.reset);

// processOrderJob only reads job.data, so a plain object is enough
// here instead of a real BullMQ Job.
function fakeJob(userId: string): Job<{ userId: string; reservedAt: string }> {
  return { data: { userId, reservedAt: new Date().toISOString() } } as Job<{ userId: string; reservedAt: string }>;
}

describe("processOrderJob", () => {
  it("writes a confirmed order", async () => {
    await processOrderJob(fakeJob("arief"), ctx.db);
    const order = await ctx.db.collection("orders").findOne({ userId: "arief" });
    expect(order?.status).toBe("confirmed");
  });

  it("is idempotent: the same job processed twice yields exactly one order", async () => {
    await processOrderJob(fakeJob("boss"), ctx.db);
    await processOrderJob(fakeJob("boss"), ctx.db);

    const count = await ctx.db.collection("orders").countDocuments({ userId: "boss" });
    expect(count).toBe(1);
  });
});
