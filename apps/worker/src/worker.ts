import { ORDER_QUEUE_NAME, type OrderJobData } from "@flashsale/core";
import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Db } from "mongodb";
import { processOrderJob } from "./processor.js";

/**
 * Retries (5 attempts, exponential backoff) and the failed set that
 * acts as the DLQ are both configured once, on the queue side, in
 * @flashsale/core's ORDER_JOB_OPTIONS. Nothing to repeat here.
 *
 * A crashed worker's job is picked up by another worker automatically:
 * BullMQ marks a job "stalled" if its lock isn't renewed, and retries
 * it on another worker, up to `maxStalledCount` times (default 1).
 */
export function createOrderWorker(connection: Redis, db: Db, concurrency: number): Worker<OrderJobData> {
  return new Worker<OrderJobData>(ORDER_QUEUE_NAME, (job) => processOrderJob(job, db), {
    connection,
    concurrency,
  });
}
