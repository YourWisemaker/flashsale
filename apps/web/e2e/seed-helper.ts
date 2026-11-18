import {
  connectMongo,
  createRedisClient,
  createUser,
  ensureOrderIndexes,
  ensureResetIndexes,
  ensureUserIndexes,
  ORDERS_COLLECTION,
  OUTBOX_COLLECTION,
  PASSWORD_RESETS_COLLECTION,
  readOutbox,
  saveProduct,
  SaleGate,
  USERS_COLLECTION,
} from "@flashsale/core";
// The real seed data, so e2e also proves the shipped images, copy and demo login work.
import { DEMO_USER } from "../../cli/src/data/demo-user.js";
import { SEED_PRODUCT } from "../../cli/src/data/product.js";

export { DEMO_USER, SEED_PRODUCT };

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/flashsale";
const MINUTE = 60_000;

/**
 * Same pattern as stress/src/run-scenario.ts: reach into Redis and
 * Mongo directly to put the shop into a known state before driving the
 * browser, instead of adding a test-only HTTP endpoint that wouldn't
 * exist in production. Leaves exactly one account: the demo user.
 */
export async function seedSale(input: { totalStock: number; startsInMs?: number; endsInMs?: number }): Promise<void> {
  const redis = createRedisClient(REDIS_URL);
  const { client, db } = await connectMongo(MONGO_URL);
  await ensureOrderIndexes(db);
  await ensureUserIndexes(db);
  await ensureResetIndexes(db);
  for (const name of [ORDERS_COLLECTION, USERS_COLLECTION, PASSWORD_RESETS_COLLECTION, OUTBOX_COLLECTION]) await db.collection(name).deleteMany({});
  await createUser(db, DEMO_USER.email, DEMO_USER.password);
  await saveProduct(db, SEED_PRODUCT);
  await new SaleGate(redis).configure({
    startsAt: new Date(Date.now() + (input.startsInMs ?? -1000)),
    endsAt: new Date(Date.now() + (input.endsInMs ?? 10 * MINUTE)),
    totalStock: input.totalStock,
  });
  await client.close();
  await redis.quit();
}

/** The reset link from the newest email in the outbox (the demo's stand-in for an inbox). */
export async function latestResetLink(email: string): Promise<string> {
  const { client, db } = await connectMongo(MONGO_URL);
  const [mail] = await readOutbox(db, email, 1);
  await client.close();
  const link = /https?:\/\/\S+\/reset-password\?token=[\w-]+/.exec(mail?.text ?? "")?.[0];
  if (!link) throw new Error(`No reset email for ${email}`);
  return link;
}
