import { confirmOrder, type OrderJobData } from "@flashsale/core";
import type { Job } from "bullmq";
import type { Db } from "mongodb";

/**
 * The actual work for one job. Thin on purpose: `confirmOrder` already
 * upserts on a unique `userId` index, so a stalled job that gets
 * picked up twice, or a job replayed from the DLQ, writes the same
 * order both times instead of creating a duplicate or throwing.
 */
export async function processOrderJob(job: Job<OrderJobData>, db: Db): Promise<void> {
  await confirmOrder(db, job.data.userId);
}
