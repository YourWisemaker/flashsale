import { connectMongo, createQueueConnection, createRedisClient, ensureOrderIndexes, ORDER_QUEUE_NAME } from "@flashsale/core";
import { Queue } from "bullmq";

// Separate db/database from the other test suites so they can run at
// the same time without clashing.
// Base URLs come from TEST_REDIS_URL / TEST_MONGO_URL, see CLAUDE.md.
const TEST_REDIS_URL = `${process.env.TEST_REDIS_URL ?? "redis://localhost:6379"}/13`;
export const TEST_MONGO_URL = `${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test_worker`;

export async function setupWorkerTest() {
  const redis = createRedisClient(TEST_REDIS_URL);
  const { client: mongoClient, db } = await connectMongo(TEST_MONGO_URL);
  await ensureOrderIndexes(db);
  const queueConnection = createQueueConnection(TEST_REDIS_URL);
  const queue = new Queue(ORDER_QUEUE_NAME, { connection: queueConnection });

  async function reset() {
    await redis.flushdb();
    await db.collection("orders").deleteMany({});
  }

  async function teardown() {
    await queue.close();
    await queueConnection.quit();
    await mongoClient.close();
    await redis.quit();
  }

  return { redis, db, queue, redisUrl: TEST_REDIS_URL, reset, teardown };
}
