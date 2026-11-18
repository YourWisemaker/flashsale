import { connectMongo, createQueueConnection, createRedisClient, ensureOrderIndexes, SaleGate } from "@flashsale/core";
import type { FastifyInstance } from "fastify";
import { buildApp, type AppDeps } from "../../app.js";
import { createOrderQueue } from "../../queue.js";

// Separate db/database from dev data, and from packages/core's own
// test suite, so the two can run at the same time without clashing.
// Base URLs come from TEST_REDIS_URL / TEST_MONGO_URL so parallel agents
// (separate worktrees, separate infra) never share a database. See CLAUDE.md.
const TEST_REDIS_URL = `${process.env.TEST_REDIS_URL ?? "redis://localhost:6379"}/14`;
const TEST_MONGO_URL = `${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test`;

export async function setupTestApp() {
  const redis = createRedisClient(TEST_REDIS_URL);
  const { client: mongoClient, db } = await connectMongo(TEST_MONGO_URL);
  await ensureOrderIndexes(db);
  const queueConnection = createQueueConnection(TEST_REDIS_URL);
  const queue = createOrderQueue(queueConnection);
  const saleGate = new SaleGate(redis);

  /** Real deps with optional overrides, e.g. a failing queue for one test. */
  function makeApp(overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
    // High ceiling: most tests fire many requests per second; the one
    // rate-limit test passes its own low limit.
    return buildApp({ saleGate, redis, db, queue, rateLimitMax: 10_000, logger: false, ...overrides });
  }

  const ctx = {
    // Rebuilt in reset() before every test rather than once at import,
    // so route registration runs inside each test (and Stryker's
    // mutants of route paths actually get exercised).
    app: undefined as unknown as FastifyInstance,
    saleGate,
    redis,
    db,
    queue,
    makeApp,
    async reset() {
      await ctx.app?.close();
      await redis.flushdb();
      await db.collection("orders").deleteMany({});
      await db.collection("products").deleteMany({});
      ctx.app = await makeApp();
    },
    async teardown() {
      await ctx.app?.close();
      await queue.close();
      await queueConnection.quit();
      await mongoClient.close();
      await redis.quit();
    },
  };
  return ctx;
}

export function activeWindow() {
  return { startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000) };
}
