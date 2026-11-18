/**
 * BullMQ's failed set is this system's DLQ: a job that exhausted its
 * 5 attempts lands there and stays until someone looks at it. This
 * script moves every failed job back onto the queue to be retried,
 * once whatever caused the failures (usually Mongo being down) is
 * fixed. `confirmOrder`'s upsert makes a replay harmless even if an
 * earlier attempt actually got through before failing.
 */
import { createQueueConnection, ORDER_QUEUE_NAME } from "@flashsale/core";
import { Queue } from "bullmq";
import { loadConfig } from "../config.js";

async function main() {
  const config = loadConfig(process.env);
  const connection = createQueueConnection(config.redisUrl);
  const queue = new Queue(ORDER_QUEUE_NAME, { connection });

  const failed = await queue.getFailed(0, -1);

  if (failed.length === 0) {
    console.log("DLQ is empty, nothing to replay.");
  } else {
    console.log(`Replaying ${failed.length} failed job(s)...`);
    for (const job of failed) {
      await job.retry("failed");
      console.log(`  requeued ${job.id}`);
    }
  }

  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error("dlq replay failed", err);
  process.exit(1);
});
