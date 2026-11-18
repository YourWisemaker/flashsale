import { connectMongo, createQueueConnection, findOrder, ORDER_JOB_OPTIONS, orderJobId } from "@flashsale/core";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Worker } from "bullmq";
import { createOrderWorker } from "../../worker.js";
import { setupWorkerTest, TEST_MONGO_URL } from "./test-helpers.js";

const ctx = await setupWorkerTest();
let worker: Worker | undefined;

afterAll(ctx.teardown);
beforeEach(ctx.reset);
afterEach(async () => {
  await worker?.close();
  worker = undefined;
});

describe("order worker (end to end: queue -> worker -> mongo)", () => {
  it("confirms an order for a job it picks up off the real queue", async () => {
    worker = createOrderWorker(createQueueConnection(ctx.redisUrl), ctx.db, 5);
    // Guarantees the worker's connection is live before the job is
    // added, so the test can't race the worker's own startup.
    await worker.waitUntilReady();

    const userId = `arief-${Date.now()}`;
    const completed = new Promise<void>((resolve) => worker!.on("completed", () => resolve()));

    await ctx.queue.add("confirm-order", { userId, reservedAt: new Date().toISOString() }, { jobId: userId });
    await completed;

    const order = await findOrder(ctx.db, userId);
    expect(order?.status).toBe("confirmed");
  });

  it("confirms the same user again in a later sale (completed jobs don't block re-enqueue)", async () => {
    worker = createOrderWorker(createQueueConnection(ctx.redisUrl), ctx.db, 5);
    await worker.waitUntilReady();

    const userId = `returning-${Date.now()}`;
    const jobId = orderJobId(userId);
    const confirmOnce = async () => {
      const completed = new Promise<void>((resolve) => worker!.once("completed", () => resolve()));
      await ctx.queue.add("confirm-order", { userId, reservedAt: new Date().toISOString() }, { ...ORDER_JOB_OPTIONS, jobId });
      await completed;
    };

    await confirmOnce();
    // New sale: orders are wiped, same user reserves again.
    await ctx.db.collection("orders").deleteMany({});
    await confirmOnce();

    expect((await findOrder(ctx.db, userId))?.status).toBe("confirmed");
  });

  it("moves a job to the failed set (DLQ) once its retries are exhausted", async () => {
    // A closed Mongo connection stands in for "Mongo is down": the
    // worker's write throws for a real reason, the same path a lost
    // database connection would take in production.
    const { client: deadClient, db: deadDb } = await connectMongo(TEST_MONGO_URL);
    await deadClient.close();

    worker = createOrderWorker(createQueueConnection(ctx.redisUrl), deadDb, 5);
    await worker.waitUntilReady();

    const jobId = `broken-${Date.now()}`;
    const failed = new Promise<void>((resolve) => worker!.on("failed", () => resolve()));

    await ctx.queue.add(
      "confirm-order",
      { userId: "unreachable-db", reservedAt: new Date().toISOString() },
      { jobId, attempts: 1 },
    );

    await failed;
    const failedJobs = await ctx.queue.getFailed();
    expect(failedJobs.some((job) => job.id === jobId)).toBe(true);
  });
});
