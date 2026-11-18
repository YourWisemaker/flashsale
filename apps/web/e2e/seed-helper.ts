import { connectMongo, createRedisClient, ensureOrderIndexes, ORDERS_COLLECTION, saveProduct, SaleGate } from "@flashsale/core";
// The real seed data, so e2e also proves the shipped images and copy render.
import { SEED_PRODUCT } from "../../api/src/seed/product.js";

export { SEED_PRODUCT };

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/flashsale";
const MINUTE = 60_000;

/**
 * Same pattern as stress/src/run-scenario.ts: reach into Redis and
 * Mongo directly to put the sale into a known state before driving
 * the browser, instead of adding a test-only HTTP endpoint that
 * wouldn't exist in production.
 */
export async function seedSale(input: { totalStock: number; startsInMs?: number; endsInMs?: number }): Promise<void> {
  const redis = createRedisClient(REDIS_URL);
  const { client, db } = await connectMongo(MONGO_URL);
  await ensureOrderIndexes(db);
  await db.collection(ORDERS_COLLECTION).deleteMany({});
  await saveProduct(db, SEED_PRODUCT);
  await new SaleGate(redis).configure({
    startsAt: new Date(Date.now() + (input.startsInMs ?? -1000)),
    endsAt: new Date(Date.now() + (input.endsInMs ?? 10 * MINUTE)),
    totalStock: input.totalStock,
  });
  await client.close();
  await redis.quit();
}
