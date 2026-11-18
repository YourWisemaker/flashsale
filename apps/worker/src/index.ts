import { connectMongo, createQueueConnection, ensureOrderIndexes } from "@flashsale/core";
import { loadConfig } from "./config.js";
import { createOrderWorker } from "./worker.js";

async function main() {
  const config = loadConfig(process.env);
  const { db } = await connectMongo(config.mongoUrl);
  await ensureOrderIndexes(db);

  const connection = createQueueConnection(config.redisUrl);
  const worker = createOrderWorker(connection, db, config.concurrency);

  worker.on("completed", (job) => console.log(`confirmed order for ${job.data.userId}`));
  worker.on("failed", (job, err) => console.error(`job failed for ${job?.data.userId}: ${err.message}`));

  console.log(`worker running, concurrency=${config.concurrency}`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await worker.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("worker failed to start", err);
  process.exit(1);
});
