import { confirmOrder, orderJobId, saveProduct } from "@flashsale/core";
import type { ProductDocument } from "@flashsale/core";

const PRODUCT: ProductDocument = {
  sku: "HT-TEST",
  name: "Test Hi-Top",
  description: "A sneaker.",
  priceCents: 8900,
  originalPriceCents: 14900,
  currency: "USD",
  images: [{ url: "/products/a.jpg", alt: "side view" }],
  specs: [{ label: "Upper", value: "Suede" }],
};
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
  it("rejects a request without a session with 401, before touching stock", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: { userId: "arief" } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized", message: "Log in to continue." });
    expect(await ctx.redis.get("sale:stock")).toBe("10");
  });

  it("rejects a forged or foreign session cookie with 401", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const { createSessionTokens } = await import("@flashsale/core");
    const foreign = createSessionTokens("some-other-secret-at-least-32-chars!!").sign("arief");
    for (const cookie of ["session=garbage", `session=${foreign}`]) {
      const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: { cookie } });
      expect(res.statusCode).toBe(401);
    }
  });

  it("buys as the logged-in user, ignoring any userId in the body", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief@example.com"), payload: { userId: "boss@example.com" } });

    expect(res.statusCode).toBe(202);
    expect(await ctx.saleGate.isReserved("arief@example.com")).toBe(true);
    expect(await ctx.saleGate.isReserved("boss@example.com")).toBe(false);
  });

  it("rejects before the sale starts with 403 upcoming", async () => {
    await ctx.saleGate.configure({ startsAt: new Date(Date.now() + 60_000), endsAt: new Date(Date.now() + 120_000), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });
    expect(res.statusCode).toBe(403);
    expect(res.json().status).toBe("upcoming");
  });

  it("rejects after the sale ends with 403 ended", async () => {
    await ctx.saleGate.configure({ startsAt: new Date(Date.now() - 120_000), endsAt: new Date(Date.now() - 60_000), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });
    expect(res.statusCode).toBe(403);
    expect(res.json().status).toBe("ended");
  });

  it("reserves a unit and enqueues an order job, returning 202 pending", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: "pending", stockLeft: 9 });

    const job = await ctx.queue.getJob(orderJobId("arief"));
    expect(job).not.toBeNull();
    expect(job?.data.userId).toBe("arief");
  });

  it("reserves a unit for a purely numeric userId (BullMQ rejects a bare integer job id)", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("12345") });

    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("pending");

    const job = await ctx.queue.getJob(orderJobId("12345"));
    expect(job).not.toBeNull();
    expect(job?.data.userId).toBe("12345");
  });

  it("rejects a second purchase from the same user with 409", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });
    expect(res.statusCode).toBe(409);
    expect(res.json().status).toBe("already_purchased");
  });

  it("returns 410 sold_out once stock is exhausted", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 1 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("boss") });
    expect(res.statusCode).toBe(410);
    expect(res.json().status).toBe("sold_out");
  });

  it("releases the reservation and returns 503 when the queue is unavailable", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    // Only `add` is reached on this path.
    const failingQueue = { add: async () => Promise.reject(new Error("queue down")) };
    const brokenApp = await ctx.makeApp({ queue: failingQueue as never });

    const res = await brokenApp.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    expect(await ctx.redis.get("sale:stock")).toBe("5");
    expect(await ctx.saleGate.isReserved("arief")).toBe(false);
    await brokenApp.close();
  });

  it("needs no request body at all", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    const res = await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });
    expect(res.statusCode).toBe(202);
  });

  it("enqueues the job with the retry policy and a recognizable name", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

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

    const res = await brokenApp.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    await brokenApp.close();
  });

  it("rate limits purchases per user, so people sharing an IP don't block each other", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const limitedApp = await ctx.makeApp({ rateLimitMax: 2 });
    const buy = (userId: string) => limitedApp.inject({ method: "POST", url: "/api/purchase", headers: ctx.as(userId) });

    expect((await buy("a")).statusCode).toBe(202);
    expect((await buy("a")).statusCode).toBe(409);
    const blocked = await buy("a");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().status).toBe("rate_limited");

    // The window is one second, so a client knows to retry almost at once.
    expect(Number(blocked.headers["retry-after"])).toBeLessThanOrEqual(1);

    // Same IP (inject always uses 127.0.0.1), different user: not blocked.
    expect((await buy("b")).statusCode).toBe(202);
    // The blocked request never reached the gate, so it took nothing.
    expect(await ctx.redis.get("sale:stock")).toBe("8");

    for (let i = 0; i < 5; i++) {
      expect((await limitedApp.inject({ method: "GET", url: "/api/sale" })).statusCode).toBe(200);
    }
    await limitedApp.close();
  });
});

describe("GET /api/purchase/me", () => {
  it("requires a session", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns none for a user who never attempted a purchase", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/me", headers: ctx.as("arief") });
    expect(res.json()).toEqual({ userId: "arief", status: "none" });
  });

  it("returns pending right after a reservation, before the worker confirms it", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/me", headers: ctx.as("arief") });
    expect(res.json()).toEqual({ userId: "arief", status: "pending" });
  });

  it("returns confirmed once the order is written (simulating the worker)", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });
    // apps/worker owns the real consumer; here we only need the API's
    // read path to reflect a confirmed Mongo record correctly.
    await confirmOrder(ctx.db, "arief");

    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/me", headers: ctx.as("arief") });
    expect(res.json()).toEqual({ userId: "arief", status: "confirmed" });
  });

  it("only ever shows your own status", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });

    const res = await ctx.app.inject({ method: "GET", url: "/api/purchase/me", headers: ctx.as("boss") });
    expect(res.json()).toEqual({ userId: "boss", status: "none" });
    expect((await ctx.app.inject({ method: "GET", url: "/api/purchase/arief", headers: ctx.as("boss") })).statusCode).toBe(404);
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
    await saveProduct(ctx.db, PRODUCT);

    const res = await ctx.app.inject({ method: "GET", url: "/api/product" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(res.json()).toEqual(PRODUCT);
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

  it("are set on errors too (404, 401, 429), so no response can be framed", async () => {
    expectHardened((await ctx.app.inject({ method: "GET", url: "/nope" })).headers);
    expectHardened((await ctx.app.inject({ method: "POST", url: "/api/purchase", payload: {} })).headers); // 401

    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const limitedApp = await ctx.makeApp({ rateLimitMax: 1 });
    await limitedApp.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("a") });
    const blocked = await limitedApp.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("a") });
    expect(blocked.statusCode).toBe(429);
    expectHardened(blocked.headers);
    await limitedApp.close();
  });
});
