import { confirmOrder, orderJobId, saveProduct } from "@flashsale/core";
import { SEED_PRODUCT } from "../../seed/product.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { activeWindow, setupTestApp } from "./test-helpers.js";

const ctx = await setupTestApp();

afterAll(ctx.teardown);
beforeEach(ctx.reset);

describe("GET /api/sale", () => {
  it("reports upcoming before the window starts", async () => {
    await ctx.saleGate.configure({ startsAt: new Date(Date.now() + 60_000), endsAt: new Date(Date.now() + 120_000), totalStock: 10 });
    const res = await ctx.app.inject({ method: "GET", url: "/api/sale" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("upcoming");
  });

  it("reports active with stock counts", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "GET", url: "/api/sale" });
    expect(res.json()).toMatchObject({ status: "active", totalStock: 10, stockLeft: 10 });
  });
});

describe("POST /api/purchase", () => {
  it("rejects a missing userId with 400", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_user");
  });

  it("rejects before the sale starts with 403 upcoming", async () => {
    await ctx.saleGate.configure({ startsAt: new Date(Date.now() + 60_000), endsAt: new Date(Date.now() + 120_000), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().status).toBe("upcoming");
  });

  it("rejects after the sale ends with 403 ended", async () => {
    await ctx.saleGate.configure({ startsAt: new Date(Date.now() - 120_000), endsAt: new Date(Date.now() - 60_000), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().status).toBe("ended");
  });

  it("reserves a unit and enqueues an order job, returning 202 pending", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "Arief " } });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: "pending", stockLeft: 9 });

    const job = await ctx.queue.getJob(orderJobId("arief"));
    expect(job).not.toBeNull();
    expect(job?.data.userId).toBe("arief");
  });

  it("reserves a unit for a purely numeric userId (BullMQ rejects a bare integer job id)", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "12345" } });

    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("pending");

    const job = await ctx.queue.getJob(orderJobId("12345"));
    expect(job).not.toBeNull();
    expect(job?.data.userId).toBe("12345");
  });

  it("rejects a second purchase from the same user with 409", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().status).toBe("already_purchased");
  });

  it("returns 410 sold_out once stock is exhausted", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 1 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "boss" } });
    expect(res.statusCode).toBe(410);
    expect(res.json().status).toBe("sold_out");
  });

  it("releases the reservation and returns 503 when the queue is unavailable", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    // Only `add` is reached on this path.
    const failingQueue = { add: async () => Promise.reject(new Error("queue down")) };
    const brokenApp = await ctx.makeApp({ queue: failingQueue as never });

    const res = await brokenApp.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    expect(await ctx.redis.get("sale:stock")).toBe("5");
    expect(await ctx.saleGate.isReserved("arief")).toBe(false);
    await brokenApp.close();
  });

  it("rejects a request with no body at all with 400 instead of crashing", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_user", message: "userId is required" });
  });

  it("enqueues the job with the retry policy and a recognizable name", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    const job = await ctx.queue.getJob(orderJobId("arief"));
    expect(job?.name).toBe("confirm-order");
    expect(job?.opts).toMatchObject({ attempts: 5, removeOnComplete: true, removeOnFail: false });
  });
});

describe("failure paths", () => {
  it("returns 503 unavailable when the Redis gate itself fails", async () => {
    // Only `purchase` is reached before the failure.
    const brokenGate = { purchase: async () => Promise.reject(new Error("redis down")) };
    const brokenApp = await ctx.makeApp({ saleGate: brokenGate as never });

    const res = await brokenApp.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    await brokenApp.close();
  });

  it("returns 429 rate_limited once an IP exceeds the purchase limit, without limiting status reads", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const limitedApp = await ctx.makeApp({ rateLimitMax: 2 });
    const buy = (userId: string) => limitedApp.inject({ method: "POST", url: "/api/purchase", payload: { userId } });

    expect((await buy("a")).statusCode).toBe(202);
    expect((await buy("b")).statusCode).toBe(202);
    const blocked = await buy("c");

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().status).toBe("rate_limited");
    // The blocked request never reached the gate, so no unit was taken.
    expect(await ctx.saleGate.isReserved("c")).toBe(false);

    for (let i = 0; i < 5; i++) {
      expect((await limitedApp.inject({ method: "GET", url: "/api/sale" })).statusCode).toBe(200);
    }
    await limitedApp.close();
  });
});

describe("GET /api/purchase/:userId", () => {
  it("rejects an invalid userId with 400", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/not%20valid" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_user", message: "userId is required" });
  });

  it("normalizes the userId the same way the purchase route does", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/ARIEF" });
    expect(res.json()).toEqual({ userId: "arief", status: "pending" });
  });

  it("returns none for a user who never attempted a purchase", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/arief" });
    expect(res.json()).toEqual({ userId: "arief", status: "none" });
  });

  it("returns pending right after a reservation, before the worker confirms it", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/arief" });
    expect(res.json()).toEqual({ userId: "arief", status: "pending" });
  });

  it("returns confirmed once the order is written (simulating the worker)", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });

    // apps/worker owns the real consumer; here we only need the API's
    // read path to reflect a confirmed Mongo record correctly.
    await confirmOrder(ctx.db, "arief");

    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/arief" });
    expect(res.json()).toEqual({ userId: "arief", status: "confirmed" });
  });
});

describe("GET /health", () => {
  it("returns 200 ok when Redis and Mongo are reachable", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 unavailable when a dependency is down", async () => {
    // `ping` is what the health route calls; `defineCommand` is called by
    // the rate-limit plugin's Redis store when the app is built.
    const deadRedis = { ping: async () => Promise.reject(new Error("redis down")), defineCommand: () => undefined };
    const brokenApp = await ctx.makeApp({ redis: deadRedis as never, rateLimitMax: 10_000 });

    const res = await brokenApp.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    await brokenApp.close();
  });
});

describe("buildApp", () => {
  it("logs by default, so production gets request logs without extra config", async () => {
    const { buildApp } = await import("../../app.js");
    const app = await buildApp({ saleGate: ctx.saleGate, redis: ctx.redis, db: ctx.db, queue: ctx.queue, rateLimitMax: 10 });
    expect(app.log.level).toBe("info");
    await app.close();
  });
});

describe("GET /api/product", () => {
  it("returns 404 with a hint when nothing is seeded", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/product" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found", message: "No product seeded. Run pnpm seed." });
  });

  it("returns the seeded product, cacheable, without Mongo internals", async () => {
    await saveProduct(ctx.db, SEED_PRODUCT);

    const res = await ctx.app.inject({ method: "GET", url: "/api/product" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(res.json()).toEqual(SEED_PRODUCT);
  });
});

describe("security headers", () => {
  const expectHardened = (headers: Record<string, unknown>) => {
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  };

  it("are set on normal responses", async () => {
    expectHardened((await ctx.app.inject({ method: "GET", url: "/api/sale" })).headers);
  });

  it("are set on errors too (404, 400, 429), so no response can be framed", async () => {
    expectHardened((await ctx.app.inject({ method: "GET", url: "/nope" })).headers);
    expectHardened((await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: {} })).headers);

    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const limitedApp = await ctx.makeApp({ rateLimitMax: 1 });
    await limitedApp.inject({ method: "POST", url: "/api/purchase", payload: { userId: "a" } });
    const blocked = await limitedApp.inject({ method: "POST", url: "/api/purchase", payload: { userId: "b" } });
    expect(blocked.statusCode).toBe(429);
    expectHardened(blocked.headers);
    await limitedApp.close();
  });
});
