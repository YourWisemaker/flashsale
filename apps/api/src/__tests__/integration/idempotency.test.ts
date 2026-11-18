import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createIdempotencyStore } from "../../idempotency.js";
import { activeWindow, setupTestApp } from "./test-helpers.js";

const ctx = await setupTestApp();

afterAll(ctx.teardown);
beforeEach(ctx.reset);

const KEY = "0b5f6e4a-9c1d-4c8e-8f1a-2d3c4b5a6e7f";
const buy = (user: string, key?: string, app = ctx.app) =>
  app.inject({ method: "POST", url: "/api/purchase", headers: { ...ctx.as(user), ...(key ? { "idempotency-key": key } : {}) } });

describe("Idempotency-Key on POST /api/purchase", () => {
  it("replays the original response for a retry with the same key, without touching stock again", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });

    const first = await buy("arief", KEY);
    const retry = await buy("arief", KEY);

    expect(first.statusCode).toBe(202);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(retry.statusCode).toBe(202);
    expect(retry.json()).toEqual(first.json());
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(await ctx.redis.get("sale:stock")).toBe("9");
    expect(await ctx.queue.getJobCounts("waiting")).toMatchObject({ waiting: 1 });
  });

  it("without a key, a retry is a new attempt and gets already_purchased (the old behavior)", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    expect((await buy("arief")).statusCode).toBe(202);
    const retry = await buy("arief");
    expect(retry.statusCode).toBe(409);
    expect(retry.json()).toEqual({ status: "already_purchased" });
  });

  it("a new key from the same user is a new attempt", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await buy("arief", KEY);
    const other = await buy("arief", "another-key-123");
    expect(other.json()).toEqual({ status: "already_purchased" });
    expect(other.headers["idempotent-replayed"]).toBeUndefined();
  });

  it("replays failures too: a sold-out answer stays sold out for that key", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 0 });
    expect((await buy("arief", KEY)).json()).toEqual({ status: "sold_out" });
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });

    const retry = await buy("arief", KEY);
    expect(retry.statusCode).toBe(410);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(await ctx.redis.get("sale:stock")).toBe("5");
  });

  it("scopes keys per account: the same key from two users is two purchases", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    expect((await buy("arief", KEY)).statusCode).toBe(202);
    const boss = await buy("boss", KEY);
    expect(boss.statusCode).toBe(202);
    expect(boss.headers["idempotent-replayed"]).toBeUndefined();
    expect(await ctx.redis.get("sale:stock")).toBe("8");
  });

  it("lets exactly one of several concurrent duplicates run; the others are told it's in progress or replayed", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });

    const results = await Promise.all(Array.from({ length: 5 }, () => buy("arief", KEY)));
    const fresh = results.filter((r) => r.statusCode === 202 && r.headers["idempotent-replayed"] === undefined);
    const others = results.filter((r) => !fresh.includes(r));

    expect(fresh).toHaveLength(1);
    for (const r of others) {
      const inProgress = r.statusCode === 409 && r.json().status === "in_progress";
      const replayed = r.statusCode === 202 && r.headers["idempotent-replayed"] === "true";
      expect(inProgress || replayed).toBe(true);
    }
    expect(await ctx.redis.get("sale:stock")).toBe("9");
  });

  it("says in_progress while the first request with that key is still running", async () => {
    await ctx.redis.set(`idem:arief:${KEY}`, "in_progress");
    const res = await buy("arief", KEY);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ status: "in_progress" });
  });

  it("treats a key that vanished between claim and read as in progress, so the client simply retries", async () => {
    // Simulates the key expiring or being released at exactly the wrong moment.
    const vanishing = Object.create(ctx.redis, {
      set: { value: async () => null },
      get: { value: async () => null },
    });
    const app = await ctx.makeApp({ redis: vanishing });
    const res = await buy("arief", KEY, app);
    expect(res.json()).toEqual({ status: "in_progress" });
    await app.close();
  });

  it("forgets the key after a 503, so the retry actually runs", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    const brokenQueue = { add: async () => Promise.reject(new Error("queue down")) };
    const broken = await ctx.makeApp({ queue: brokenQueue as never });

    expect((await buy("arief", KEY, broken)).statusCode).toBe(503);
    await broken.close();

    const retry = await buy("arief", KEY);
    expect(retry.statusCode).toBe(202);
    expect(retry.headers["idempotent-replayed"]).toBeUndefined();
  });

  it("answers 503 when Redis can't record the key", async () => {
    const failingRedis = Object.create(ctx.redis, { set: { value: async () => Promise.reject(new Error("redis down")) } });
    const app = await ctx.makeApp({ redis: failingRedis });
    const res = await buy("arief", KEY, app);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    await app.close();
  });

  it("stores the key for 24 hours, scoped to the user", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    await buy("arief", KEY);
    const ttl = await ctx.redis.ttl(`idem:arief:${KEY}`);
    expect(ttl).toBeGreaterThan(86_390);
    expect(ttl).toBeLessThanOrEqual(86_400);
    expect(JSON.parse((await ctx.redis.get(`idem:arief:${KEY}`))!)).toEqual({ httpCode: 202, body: { status: "pending", stockLeft: 4 } });
  });

  it("rejects a malformed key with 400 before touching stock", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    const res = await buy("arief", "bad key");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_idempotency_key", message: "Idempotency-Key must be 8 to 128 letters, digits, - or _." });
    expect(await ctx.redis.get("sale:stock")).toBe("5");
  });
});

describe("idempotency store", () => {
  it("claims once, reports in progress, replays once saved, and claims again after release", async () => {
    const store = createIdempotencyStore(ctx.redis);

    expect(await store.claim("arief", KEY)).toEqual({ state: "claimed" });
    expect(await store.claim("arief", KEY)).toEqual({ state: "in_progress" });

    await store.save("arief", KEY, { httpCode: 202, body: { status: "pending" } });
    expect(await store.claim("arief", KEY)).toEqual({ state: "replay", response: { httpCode: 202, body: { status: "pending" } } });

    await store.release("arief", KEY);
    expect(await store.claim("arief", KEY)).toEqual({ state: "claimed" });
  });
});
