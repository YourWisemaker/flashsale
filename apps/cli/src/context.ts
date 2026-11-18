import {
  connectMongo,
  createQueueConnection,
  createRedisClient,
  ORDER_QUEUE_NAME,
  SaleGate,
  type OrderJobData,
} from "@flashsale/core";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { Db } from "mongodb";

/** Everything a command may touch. Commands get this, never env or URLs. */
export interface Context {
  redis: Redis;
  db: Db;
  queue: Queue<OrderJobData>;
  gate: SaleGate;
  /** Shown before destructive commands so you can see which data is about to go. */
  target: string;
  close(): Promise<void>;
}

export async function openContext(urls: { redisUrl: string; mongoUrl: string }): Promise<Context> {
  const redis = createRedisClient(urls.redisUrl);
  const { client, db } = await connectMongo(urls.mongoUrl);
  const queueConnection = createQueueConnection(urls.redisUrl);
  const queue = new Queue<OrderJobData>(ORDER_QUEUE_NAME, { connection: queueConnection });
  // Closing a queue whose connection is still starting crashes the process
  // with "Connection is closed", which happens when a command fails fast.
  await queue.waitUntilReady();

  return {
    redis,
    db,
    queue,
    gate: new SaleGate(redis),
    target: `${redact(urls.redisUrl)} + ${redact(urls.mongoUrl)}`,
    async close() {
      await queue.close();
      await queueConnection.quit();
      await client.close();
      await redis.quit();
    },
  };
}

/** Hides credentials in a connection URL before printing it. */
export function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/, "//***@");
}
