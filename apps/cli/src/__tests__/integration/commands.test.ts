import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkCredentials,
  confirmOrder,
  createUser,
  readOutbox,
  sendMail,
  userExists,
  USERS_COLLECTION,
  OUTBOX_COLLECTION,
  PASSWORD_RESETS_COLLECTION,
  createResetToken,
  findOrder,
  findProduct,
  ORDER_QUEUE_NAME,
  orderJobId,
  ORDERS_COLLECTION,
  PRODUCTS_COLLECTION,
  SALE_BUYERS_KEY,
  SALE_CONFIG_KEY,
  SALE_STOCK_KEY,
  saveProduct,
} from "@flashsale/core";
import { Worker } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Args } from "../../command.js";
import { findCommand } from "../../commands/index.js";
import { openContext, type Context } from "../../context.js";
import { DEMO_USER } from "../../data/demo-user.js";
import { SEED_PRODUCT } from "../../data/product.js";

// Own Redis db and Mongo database, so this runs alongside the other suites.
// Base URLs come from TEST_REDIS_URL / TEST_MONGO_URL (see root CLAUDE.md).
const REDIS_URL = `${process.env.TEST_REDIS_URL ?? "redis://localhost:6379"}/10`;
const MONGO_URL = `${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test_cli`;

let ctx: Context;
const run = (name: string, overrides: Partial<Args> = {}) =>
  findCommand(name)!.run(ctx, { positionals: [], flags: {}, env: {}, ...overrides });
const activeSale = (totalStock = 10) =>
  ctx.gate.configure({ startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000), totalStock });
const buy = async (userId: string) => {
  await ctx.gate.purchase(userId);
  await ctx.queue.add("confirm-order", { userId, reservedAt: new Date().toISOString() }, { jobId: orderJobId(userId) });
};

/** A worker that takes one job and holds it in "active" until you call done(). */
async function holdJobActive() {
  let done!: () => void;
  const held = new Promise<void>((resolve) => (done = resolve));
  let started!: () => void;
  const isActive = new Promise<void>((resolve) => (started = resolve));
  const worker = new Worker(
    ORDER_QUEUE_NAME,
    async () => {
      started();
      await held;
    },
    { connection: { url: REDIS_URL } },
  );
  return {
    isActive,
    async release() {
      done();
      await worker.close(true);
    },
  };
}

beforeAll(async () => {
  ctx = await openContext({ redisUrl: REDIS_URL, mongoUrl: MONGO_URL });
});

beforeEach(async () => {
  await ctx.redis.flushdb();
  await ctx.db.collection(ORDERS_COLLECTION).deleteMany({});
  await ctx.db.collection(PRODUCTS_COLLECTION).deleteMany({});
  for (const name of [USERS_COLLECTION, OUTBOX_COLLECTION, PASSWORD_RESETS_COLLECTION]) await ctx.db.collection(name).deleteMany({});
});

afterAll(async () => {
  await ctx.redis.flushdb();
  await ctx.db.dropDatabase();
  await ctx.close();
});

describe("status", () => {
  it("says what's missing before anything is seeded", async () => {
    expect(await run("status")).toEqual([
      "Sale:     not seeded (run: pnpm cli seed)",
      "Product:  none (run: pnpm cli product:inject)",
      "Accounts: 0",
      "Buyers:   0 holding a unit, 0 confirmed in Mongo",
      "Queue:    0 waiting, 0 active, 0 delayed, 0 failed (DLQ)",
    ]);
  });

  it("reports the live sale, product, buyers and queue", async () => {
    await activeSale(10);
    await saveProduct(ctx.db, SEED_PRODUCT);
    await buy("arief");
    await confirmOrder(ctx.db, "boss");
    await createUser(ctx.db, "arief@example.com", "secret-123");

    const [sale, product, accounts, buyers, queue] = await run("status");
    expect(accounts).toBe("Accounts: 1");
    expect(sale).toMatch(/^Sale: {5}active, 9 of 10 left, \S+ to \S+$/);
    expect(product).toBe(`Product:  ${SEED_PRODUCT.name} (${SEED_PRODUCT.sku})`);
    expect(buyers).toBe("Buyers:   1 holding a unit, 1 confirmed in Mongo");
    expect(queue).toBe("Queue:    1 waiting, 0 active, 0 delayed, 0 failed (DLQ)");
  });
});

describe("migrate", () => {
  it("creates the order, user and reset-token indexes, and can run twice", async () => {
    for (const name of [ORDERS_COLLECTION, USERS_COLLECTION, PASSWORD_RESETS_COLLECTION]) await ctx.db.collection(name).drop().catch(() => undefined);
    expect(await run("migrate")).toEqual(["Indexes ready: orders.userId (unique), users.email (unique), password_resets (token hash, 30 min expiry)."]);
    await run("migrate");

    expect((await ctx.db.collection(ORDERS_COLLECTION).indexes()).find((i) => i.key.userId === 1)).toMatchObject({ unique: true });
    expect((await ctx.db.collection(USERS_COLLECTION).indexes()).find((i) => i.key.email === 1)).toMatchObject({ unique: true });
    expect((await ctx.db.collection(PASSWORD_RESETS_COLLECTION).indexes()).find((i) => i.key.expiresAt === 1)).toMatchObject({ expireAfterSeconds: 0 });
  });
});

describe("seed", () => {
  it("writes the product and the sale window", async () => {
    const lines = await run("seed", { flags: { stock: "25", start: "now", minutes: "30" } });

    expect(lines[1]).toBe(`Product:  ${SEED_PRODUCT.name} (${SEED_PRODUCT.sku})`);
    expect(lines[2]).toMatch(/^Sale: {5}25 units, /);
    expect(lines[3]).toBe(`Demo:     ${DEMO_USER.email} / ${DEMO_USER.password}`);
    expect(await checkCredentials(ctx.db, DEMO_USER.email, DEMO_USER.password)).toBe(true);
    expect(await findProduct(ctx.db)).toEqual(SEED_PRODUCT);
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("25");
    expect((await ctx.gate.getSnapshot()).status).toBe("active");
  });

  it("refuses to replace a seeded sale without --force, and changes nothing", async () => {
    await activeSale(10);
    await ctx.gate.purchase("arief");

    await expect(run("seed", { flags: { stock: "50" } })).rejects.toThrow("A sale is already seeded (active, 9 of 10 left). Re-run with --force to replace it.");
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("9");
    expect(await ctx.gate.isReserved("arief")).toBe(true);
  });

  it("replaces a seeded sale with --force, forgetting buyers", async () => {
    await activeSale(10);
    await ctx.gate.purchase("arief");

    await run("seed", { flags: { stock: "50", force: true } });

    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("50");
    expect(await ctx.gate.isReserved("arief")).toBe(false);
  });

  it("resets the demo account's password if someone changed it, so the README login always works", async () => {
    await createUser(ctx.db, DEMO_USER.email, "someone-changed-it");
    await run("seed");
    expect(await checkCredentials(ctx.db, DEMO_USER.email, DEMO_USER.password)).toBe(true);
    expect(await ctx.db.collection(USERS_COLLECTION).countDocuments()).toBe(1);
  });

  it("validates the window before touching anything", async () => {
    await expect(run("seed", { flags: { stock: "-1" } })).rejects.toThrow("Stock must be a whole number");
    expect(await findProduct(ctx.db)).toBeNull();
  });
});

describe("product:inject / product:clean", () => {
  it("injects the built-in product by default", async () => {
    expect(await run("product:inject")).toEqual([`Product injected: ${SEED_PRODUCT.name} (${SEED_PRODUCT.sku}), 2 image(s).`]);
    expect(await findProduct(ctx.db)).toEqual(SEED_PRODUCT);
  });

  it("injects a product from a JSON file, replacing the current one", async () => {
    await saveProduct(ctx.db, SEED_PRODUCT);
    const file = join(await mkdtemp(join(tmpdir(), "cli-")), "product.json");
    const custom = { ...SEED_PRODUCT, sku: "CUSTOM-1", name: "Custom Shoe", images: [{ url: "/products/hi-top-left.jpg", alt: "side" }] };
    await writeFile(file, JSON.stringify(custom));

    expect(await run("product:inject", { flags: { file } })).toEqual(["Product injected: Custom Shoe (CUSTOM-1), 1 image(s)."]);
    expect(await findProduct(ctx.db)).toEqual(custom);
    expect(await ctx.db.collection(PRODUCTS_COLLECTION).countDocuments()).toBe(1);
  });

  it("rejects a missing file, bad JSON, or an invalid product, leaving the current one", async () => {
    await saveProduct(ctx.db, SEED_PRODUCT);
    const dir = await mkdtemp(join(tmpdir(), "cli-"));
    await writeFile(join(dir, "bad.json"), "{ not json");
    await writeFile(join(dir, "invalid.json"), JSON.stringify({ ...SEED_PRODUCT, priceCents: -1 }));

    await expect(run("product:inject", { flags: { file: join(dir, "missing.json") } })).rejects.toThrow(`Can't read product file "${join(dir, "missing.json")}"`);
    await expect(run("product:inject", { flags: { file: join(dir, "bad.json") } })).rejects.toThrow("isn't valid JSON");
    await expect(run("product:inject", { flags: { file: join(dir, "invalid.json") } })).rejects.toThrow('"priceCents" must be a positive whole number');
    expect(await findProduct(ctx.db)).toEqual(SEED_PRODUCT);
  });

  it("cleans up the product, and says so when there's nothing to remove", async () => {
    await saveProduct(ctx.db, SEED_PRODUCT);
    expect(await run("product:clean")).toEqual(["Product removed."]);
    expect(await findProduct(ctx.db)).toBeNull();
    expect(await run("product:clean")).toEqual(["No product to remove."]);
  });
});

describe("user:clean", () => {
  it("frees a pending buyer's unit and drops their queued job", async () => {
    await activeSale(5);
    await buy("arief");

    expect(await run("user:clean", { positionals: [" Arief "] })).toEqual([
      "Cleaned up arief:",
      "  unit returned to stock: yes",
      "  order deleted: no (none confirmed)",
      "  queued job: removed",
    ]);
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("5");
    expect(await ctx.gate.isReserved("arief")).toBe(false);
    expect(await ctx.queue.getJob(orderJobId("arief"))).toBeUndefined();
  });

  it("frees a confirmed buyer's unit and deletes their order, so they can buy again", async () => {
    await activeSale(5);
    await ctx.gate.purchase("arief");
    await confirmOrder(ctx.db, "arief");

    const lines = await run("user:clean", { positionals: ["arief"] });

    expect(lines).toContain("  order deleted: yes");
    expect(lines).toContain("  queued job: none");
    expect(await findOrder(ctx.db, "arief")).toBeNull();
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("5");
    expect((await ctx.gate.purchase("arief")).outcome).toBe("reserved");
  });

  it("leaves other buyers alone", async () => {
    await activeSale(5);
    await buy("arief");
    await buy("boss");

    await run("user:clean", { positionals: ["arief"] });

    expect(await ctx.gate.isReserved("boss")).toBe(true);
    expect(await ctx.queue.getJob(orderJobId("boss"))).toBeDefined();
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("4");
  });

  it("deletes an order even when the user no longer holds a unit", async () => {
    await activeSale(5);
    // boss first, so a bug that deletes "any one order" would hit boss.
    await confirmOrder(ctx.db, "boss");
    await confirmOrder(ctx.db, "arief");

    expect(await run("user:clean", { positionals: ["arief"] })).toEqual([
      "Cleaned up arief:",
      "  unit returned to stock: no (they didn't hold one)",
      "  order deleted: yes",
      "  queued job: none",
    ]);
    expect(await findOrder(ctx.db, "boss")).not.toBeNull();
  });

  it("removes a lone queued job", async () => {
    await ctx.queue.add("confirm-order", { userId: "arief", reservedAt: new Date().toISOString() }, { jobId: orderJobId("arief") });

    expect(await run("user:clean", { positionals: ["arief"] })).toContain("  queued job: removed");
    expect(await ctx.queue.getJob(orderJobId("arief"))).toBeUndefined();
  });

  it("says when the user's job is being processed right now and can't be removed", async () => {
    const holder = await holdJobActive();
    await ctx.queue.add("confirm-order", { userId: "arief", reservedAt: new Date().toISOString() }, { jobId: orderJobId("arief") });
    await holder.isActive;

    const lines = await run("user:clean", { positionals: ["arief"] });
    await holder.release();

    expect(lines).toContain("  queued job: being processed right now, will confirm an order; run this again");
  });

  it("reports when there's nothing to clean, without touching stock", async () => {
    await activeSale(5);
    expect(await run("user:clean", { positionals: ["nobody"] })).toEqual(["Nothing to clean up for nobody."]);
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("5");
  });

  it("rejects an invalid user id", async () => {
    await expect(run("user:clean", { positionals: ["not valid"] })).rejects.toThrow("Give a valid user id");
    await expect(run("user:clean")).rejects.toThrow("Give a valid user id");
  });
});

describe("users:clean", () => {
  it("removes every buyer, order and job (DLQ included) and puts stock back to full", async () => {
    await activeSale(10);
    await buy("arief");
    await buy("boss");
    await confirmOrder(ctx.db, "arief");
    await saveProduct(ctx.db, SEED_PRODUCT);

    expect(await run("users:clean")).toEqual([
      "Removed 2 buyer(s), 1 order(s), and every queued and failed job.",
      "Stock reset to 10. Product and sale window kept.",
    ]);
    expect(await ctx.redis.scard(SALE_BUYERS_KEY)).toBe(0);
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("10");
    expect(await ctx.db.collection(ORDERS_COLLECTION).countDocuments()).toBe(0);
    expect(await ctx.queue.getJobCounts("waiting", "failed")).toMatchObject({ waiting: 0, failed: 0 });
    expect(await findProduct(ctx.db)).toEqual(SEED_PRODUCT);
    expect((await ctx.gate.getSnapshot()).status).toBe("active");
  });

  it("clears a job a worker is processing right now", async () => {
    const holder = await holdJobActive();
    await buy("arief");
    await holder.isActive;

    await run("users:clean");
    await holder.release();

    expect(await ctx.queue.getJob(orderJobId("arief"))).toBeUndefined();
  });

  it("leaves the queue usable afterwards (not paused)", async () => {
    await activeSale(10);
    await buy("arief");
    await run("users:clean");

    expect(await ctx.queue.isPaused()).toBe(false);
    await buy("boss");
    expect(await ctx.queue.getJob(orderJobId("boss"))).toBeDefined();
  });

  it("works with no sale seeded", async () => {
    expect(await run("users:clean")).toEqual([
      "Removed 0 buyer(s), 0 order(s), and every queued and failed job.",
      "No sale seeded, so no stock to reset.",
    ]);
    expect(await ctx.redis.exists(SALE_STOCK_KEY)).toBe(0);
  });
});

describe("reset", () => {
  it("deletes the sale, buyers, queue, orders and product, keeping indexes", async () => {
    await run("migrate");
    await activeSale(10);
    await buy("arief");
    await confirmOrder(ctx.db, "arief");
    await saveProduct(ctx.db, SEED_PRODUCT);
    await createUser(ctx.db, "arief@example.com", "secret-123");
    await createResetToken(ctx.db, "arief@example.com");
    await sendMail(ctx.db, { to: "arief@example.com", subject: "s", text: "t" });

    expect(await run("reset")).toEqual([
      "Deleted the sale, 1 order(s), 1 product(s), 1 account(s), reset links, the outbox, and the queue.",
      "Indexes kept. Run pnpm cli seed to start again.",
    ]);
    expect(await ctx.redis.exists(SALE_CONFIG_KEY, SALE_STOCK_KEY, SALE_BUYERS_KEY)).toBe(0);
    expect(await ctx.queue.getJobCounts("waiting")).toMatchObject({ waiting: 0 });
    expect(await ctx.db.collection(ORDERS_COLLECTION).countDocuments()).toBe(0);
    expect(await findProduct(ctx.db)).toBeNull();
    for (const name of [USERS_COLLECTION, PASSWORD_RESETS_COLLECTION, OUTBOX_COLLECTION]) expect(await ctx.db.collection(name).countDocuments(), name).toBe(0);
    const indexes = await ctx.db.collection(ORDERS_COLLECTION).indexes();
    expect(indexes.some((i) => i.key.userId === 1 && i.unique)).toBe(true);
  });
});

describe("user:create / user:delete", () => {
  it("creates an account that can log in", async () => {
    await run("migrate");
    expect(await run("user:create", { positionals: [" New@Example.com ", "a-long-password"] })).toEqual(["Account created: new@example.com"]);
    expect(await checkCredentials(ctx.db, "new@example.com", "a-long-password")).toBe(true);
  });

  it("refuses a duplicate, a bad email, or a weak password", async () => {
    await run("migrate");
    await createUser(ctx.db, "taken@example.com", "secret-123");
    await expect(run("user:create", { positionals: ["taken@example.com", "secret-456"] })).rejects.toThrow("taken@example.com already has an account.");
    await expect(run("user:create", { positionals: ["nope", "secret-456"] })).rejects.toThrow("Give a valid email");
    await expect(run("user:create", { positionals: ["ok@example.com", "short"] })).rejects.toThrow("Password must be at least 8 characters.");
    await expect(run("user:create", { positionals: ["ok@example.com"] })).rejects.toThrow("Password is required.");
  });

  it("deletes the account and frees its unit, order and job", async () => {
    await activeSale(5);
    await createUser(ctx.db, "arief@example.com", "secret-123");
    await createUser(ctx.db, "boss@example.com", "secret-123");
    await buy("arief@example.com");
    await confirmOrder(ctx.db, "arief@example.com");

    expect(await run("user:delete", { positionals: ["Arief@example.com"] })).toEqual([
      "Account deleted: arief@example.com",
      "Cleaned up arief@example.com:",
      "  unit returned to stock: yes",
      "  order deleted: yes",
      "  queued job: removed",
    ]);
    expect(await userExists(ctx.db, "arief@example.com")).toBe(false);
    expect(await userExists(ctx.db, "boss@example.com")).toBe(true);
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("5");
  });

  it("says so when there's no such account", async () => {
    expect(await run("user:delete", { positionals: ["ghost@example.com"] })).toEqual(["No account for ghost@example.com.", "Nothing to clean up for ghost@example.com."]);
    await expect(run("user:delete", { positionals: ["not-an-email"] })).rejects.toThrow("Give a valid email");
  });
});

describe("outbox", () => {
  it("is empty to start with", async () => {
    expect(await run("outbox")).toEqual(["Outbox is empty."]);
    expect(await run("outbox", { positionals: ["a@example.com"] })).toEqual(["No emails sent to a@example.com."]);
  });

  it("shows the latest emails, optionally for one recipient", async () => {
    await sendMail(ctx.db, { to: "a@example.com", subject: "Reset your password", text: "link-a" });
    await sendMail(ctx.db, { to: "b@example.com", subject: "Other", text: "link-b" });

    const forA = await run("outbox", { positionals: ["A@example.com"] });
    expect(forA[0]).toMatch(/^--- \S+ {2}To: a@example\.com$/);
    expect(forA.slice(1)).toEqual(["Subject: Reset your password", "", "link-a", ""]);
    expect((await run("outbox")).filter((l) => l.startsWith("Subject:"))).toEqual(["Subject: Other", "Subject: Reset your password"]);
    expect((await readOutbox(ctx.db)).length).toBe(2);
  });

  it("shows at most five", async () => {
    for (let i = 0; i < 7; i++) await sendMail(ctx.db, { to: "a@example.com", subject: `n${i}`, text: "x" });
    expect((await run("outbox")).filter((l) => l.startsWith("Subject:"))).toHaveLength(5);
  });
});

describe("reset with a job in flight", () => {
  it("still clears the queue while a worker holds a job", async () => {
    const holder = await holdJobActive();
    await buy("arief");
    await holder.isActive;

    await run("reset");
    await holder.release();

    expect(await ctx.queue.getJob(orderJobId("arief"))).toBeUndefined();
  });
});

describe("dlq:replay", () => {
  it("says so when the DLQ is empty", async () => {
    expect(await run("dlq:replay")).toEqual(["DLQ is empty, nothing to replay."]);
  });

  it("moves failed jobs back onto the queue", async () => {
    const worker = new Worker(ORDER_QUEUE_NAME, async () => Promise.reject(new Error("mongo down")), {
      connection: { url: REDIS_URL },
      autorun: false,
    });
    const failed = new Promise<void>((resolve) => worker.on("failed", () => resolve()));
    let failures = 0;
    const allFailed = new Promise<void>((resolve) => worker.on("failed", () => ++failures === 3 && resolve()));
    worker.run();
    for (const userId of ["arief", "boss", "carol"]) {
      await ctx.queue.add("confirm-order", { userId, reservedAt: new Date().toISOString() }, { jobId: orderJobId(userId), attempts: 1 });
    }
    await failed;
    await allFailed;
    await worker.close();

    expect(await run("dlq:replay")).toEqual(["Requeued 3 failed job(s)."]);
    expect(await ctx.queue.getJobCounts("failed", "waiting")).toMatchObject({ failed: 0, waiting: 3 });
  });
});

describe("reconcile", () => {
  it("rebuilds buyers and stock from confirmed orders plus queued jobs", async () => {
    await activeSale(10);
    await confirmOrder(ctx.db, "arief");
    await ctx.queue.add("confirm-order", { userId: "boss", reservedAt: new Date().toISOString() }, { jobId: orderJobId("boss") });
    // Simulate a Redis loss of the buyer set and stock.
    await ctx.redis.del(SALE_BUYERS_KEY, SALE_STOCK_KEY);

    expect(await run("reconcile")).toEqual(["Reconciled: 2 buyer(s) restored, stock set to 8 of 10."]);
    expect((await ctx.redis.smembers(SALE_BUYERS_KEY)).sort()).toEqual(["arief", "boss"]);
    expect(await ctx.redis.get(SALE_STOCK_KEY)).toBe("8");
  });

  it("keeps users whose job is in the DLQ, so a replay can't oversell", async () => {
    await activeSale(1);
    const worker = new Worker(ORDER_QUEUE_NAME, async () => Promise.reject(new Error("mongo down")), { connection: { url: REDIS_URL } });
    const failed = new Promise<void>((resolve) => worker.on("failed", () => resolve()));
    await ctx.gate.purchase("arief");
    await ctx.queue.add("confirm-order", { userId: "arief", reservedAt: new Date().toISOString() }, { jobId: orderJobId("arief"), attempts: 1 });
    await failed;
    await worker.close();
    await ctx.redis.del(SALE_BUYERS_KEY, SALE_STOCK_KEY);

    expect(await run("reconcile")).toEqual(["Reconciled: 1 buyer(s) restored, stock set to 0 of 1."]);
    expect((await ctx.gate.purchase("boss")).outcome).toBe("sold_out");
  });

  it("counts delayed and in-flight jobs as buyers", async () => {
    await activeSale(10);
    const holder = await holdJobActive();
    await ctx.queue.add("confirm-order", { userId: "busy", reservedAt: new Date().toISOString() }, { jobId: orderJobId("busy") });
    await holder.isActive;
    await ctx.queue.add("confirm-order", { userId: "later", reservedAt: new Date().toISOString() }, { jobId: orderJobId("later"), delay: 60_000 });

    const lines = await run("reconcile");
    await holder.release();

    expect(lines).toEqual(["Reconciled: 2 buyer(s) restored, stock set to 8 of 10."]);
  });

  it("ignores completed jobs: their order is already in Mongo, or was cleaned up on purpose", async () => {
    await activeSale(10);
    const worker = new Worker(ORDER_QUEUE_NAME, async () => undefined, { connection: { url: REDIS_URL } });
    const completed = new Promise<void>((resolve) => worker.on("completed", () => resolve()));
    await ctx.queue.add("confirm-order", { userId: "gone", reservedAt: new Date().toISOString() }, { jobId: orderJobId("gone") });
    await completed;
    await worker.close();

    expect(await run("reconcile")).toEqual(["Reconciled: 0 buyer(s) restored, stock set to 10 of 10."]);
  });

  it("ignores order records that aren't confirmed", async () => {
    await activeSale(10);
    await ctx.db.collection(ORDERS_COLLECTION).insertOne({ userId: "draft", status: "pending", createdAt: new Date() });

    expect(await run("reconcile")).toEqual(["Reconciled: 0 buyer(s) restored, stock set to 10 of 10."]);
  });

  it("clears stale buyers that have no order or job", async () => {
    await activeSale(10);
    await ctx.redis.sadd(SALE_BUYERS_KEY, "ghost");
    await ctx.redis.set(SALE_STOCK_KEY, "3");

    expect(await run("reconcile")).toEqual(["Reconciled: 0 buyer(s) restored, stock set to 10 of 10."]);
    expect(await ctx.redis.scard(SALE_BUYERS_KEY)).toBe(0);
  });

  it("never sets stock below zero when there are more buyers than units", async () => {
    await activeSale(1);
    await confirmOrder(ctx.db, "arief");
    await confirmOrder(ctx.db, "boss");

    expect(await run("reconcile")).toEqual(["Reconciled: 2 buyer(s) restored, stock set to 0 of 1."]);
  });

  it("refuses without a sale config, pointing at re-seeding", async () => {
    await expect(run("reconcile")).rejects.toThrow("No sale config in Redis. Re-seed with the original window first");
  });
});

describe("context", () => {
  it("names the target without credentials", () => {
    expect(ctx.target).toBe(`${REDIS_URL} + ${MONGO_URL}`);
  });

  it("closes every connection it opened", async () => {
    const own = await openContext({ redisUrl: REDIS_URL, mongoUrl: MONGO_URL });
    await own.close();
    // quit() resolves on Redis's OK; the socket finishes closing just after.
    if (own.redis.status !== "end") await new Promise((resolve) => own.redis.once("end", resolve));

    expect(own.redis.status).toBe("end");
    await expect(own.db.command({ ping: 1 })).rejects.toThrow();
    await expect(own.queue.getJobCounts("waiting")).rejects.toThrow();
  });
});
