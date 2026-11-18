import { connectMongo, createQueueConnection, ensureOrderIndexes, gracefulShutdown } from "@flashsale/core";
import { loadConfig } from "./config.js";
import { createOrderWorker } from "./worker.js";

async function main() {
  const config = loadConfig(process.env);
  const { client: mongo, db } = await connectMongo(config.mongoUrl);
  await ensureOrderIndexes(db);

  const connection = createQueueConnection(config.redisUrl);
  const worker = createOrderWorker(connection, db, config.concurrency);

  worker.on("completed", (job) => console.log(`confirmed order for ${job.data.userId}`));
  worker.on("failed", (job, err) => console.error(`job failed for ${job?.data.userId}: ${err.message}`));

  console.log(`worker running, concurrency=${config.concurrency}`);

  // worker.close() stops taking jobs and waits for the active ones to
  // finish, so no confirmation is cut off halfway. A job that outlives the
  // deadline isn't lost: its lock expires and another worker retries it.
  gracefulShutdown(async () => {
    await worker.close();
    await Promise.all([connection.quit(), mongo.close()]);
  });
}

main().catch((err) => {
  console.error("worker failed to start", err);
  process.exit(1);
});
