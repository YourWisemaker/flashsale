/**
 * Rebuilds sale:buyers and sale:stock from durable sources, for use
 * after a Redis restart where the AOF replay looks suspect (or was
 * disabled). It does NOT touch sale:config: if that hash is gone too,
 * the sale's start/end/stock numbers are lost and the only option is
 * to re-run `pnpm seed` with the original values. That's the one
 * real gap in this design, and it's called out in the README.
 *
 * "Truth" here is the union of:
 *   - confirmed orders in Mongo (durable, survives a Redis loss)
 *   - jobs still sitting in the queue (survives if Redis's AOF came
 *     back, lost entirely if it didn't)
 * Any reservation that never reached either store cannot be
 * recovered. That is the known limit from docs/PRD.md section 8.
 */
import {
  connectMongo,
  createQueueConnection,
  createRedisClient,
  ORDER_QUEUE_NAME,
  SALE_BUYERS_KEY,
  SALE_CONFIG_KEY,
  SALE_STOCK_KEY,
  type OrderJobData,
} from "@flashsale/core";
import { Queue } from "bullmq";
import { loadConfig } from "../config.js";

async function main() {
  const config = loadConfig(process.env);
  const redis = createRedisClient(config.redisUrl);
  const { client: mongoClient, db } = await connectMongo(config.mongoUrl);
  const queueConnection = createQueueConnection(config.redisUrl);
  const queue = new Queue<OrderJobData>(ORDER_QUEUE_NAME, { connection: queueConnection });

  const totalStock = Number(await redis.hget(SALE_CONFIG_KEY, "totalStock"));

  if (!totalStock) {
    console.error("sale:config has no totalStock. Re-run `pnpm seed` with the original sale window first.");
    process.exit(1);
  }

  const confirmedIds = await db.collection("orders").find({ status: "confirmed" }).map((o) => o.userId as string).toArray();
  const pendingJobs = await queue.getJobs(["waiting", "active", "delayed"]);
  const pendingIds = pendingJobs.map((job) => job.data.userId);

  const buyerIds = Array.from(new Set([...confirmedIds, ...pendingIds]));
  const stockLeft = Math.max(totalStock - buyerIds.length, 0);

  const multi = redis.multi().del(SALE_BUYERS_KEY).set(SALE_STOCK_KEY, stockLeft);
  if (buyerIds.length > 0) multi.sadd(SALE_BUYERS_KEY, ...buyerIds);
  await multi.exec();

  console.log(`Reconciled: ${buyerIds.length} buyer(s) restored, stock set to ${stockLeft} of ${totalStock}.`);

  await queue.close();
  await queueConnection.quit();
  await mongoClient.close();
  await redis.quit();
}

main().catch((err) => {
  console.error("reconcile failed", err);
  process.exit(1);
});
