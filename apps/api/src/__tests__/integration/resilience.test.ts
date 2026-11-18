import { createRedisClient, saveProduct, type ProductDocument } from "@flashsale/core";
import Fastify from "fastify";
import { MongoClient } from "mongodb";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { registerProductRoute } from "../../routes/product.js";
import { activeWindow, setupTestApp } from "./test-helpers.js";

const ctx = await setupTestApp();

afterAll(ctx.teardown);
beforeEach(ctx.reset);

const PRODUCT: ProductDocument = {
  sku: "HT-CACHE",
  name: "Cached Hi-Top",
  description: "A sneaker.",
  priceCents: 8900,
  originalPriceCents: 14900,
  currency: "USD",
  images: [],
  specs: [],
};

describe("Redis down", () => {
  // Nothing listens on port 1, so this client never reaches "ready",
  // which is what the API sees while Redis is down.
  async function appWithDeadRedis() {
    const deadRedis = createRedisClient("redis://127.0.0.1:1", { maxRetriesPerRequest: 1 });
    deadRedis.on("error", () => undefined);
    const app = await ctx.makeApp({ redis: deadRedis });
    app.addHook("onClose", async () => deadRedis.disconnect());
    return app;
  }

  it("answers 503 fast instead of waiting on reconnects", async () => {
    const app = await appWithDeadRedis();
    const started = Date.now();

    const sale = await app.inject({ method: "GET", url: "/api/sale" });
    const purchase = await app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });
    const me = await app.inject({ method: "GET", url: "/api/purchase/me", headers: ctx.as("arief") });

    expect([sale.statusCode, purchase.statusCode, me.statusCode]).toEqual([503, 503, 503]);
    expect(purchase.json()).toEqual({ status: "unavailable" });
    expect(Date.now() - started).toBeLessThan(500);
    await app.close();
  });

  it("still serves the product page, and sheds health so a load balancer pulls the instance", async () => {
    await saveProduct(ctx.db, PRODUCT);
    const app = await appWithDeadRedis();

    expect((await app.inject({ method: "GET", url: "/api/product" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(503);
    await app.close();
  });
});

describe("Mongo down", () => {
  it("answers 503, not 500, on routes that read Mongo", async () => {
    const deadMongo = new MongoClient("mongodb://127.0.0.1:1", { serverSelectionTimeoutMS: 300 });
    const app = await ctx.makeApp({ db: deadMongo.db() });

    const me = await app.inject({ method: "GET", url: "/api/purchase/me", headers: ctx.as("arief") });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "a@b.co", password: "whatever-123" } });

    expect([me.statusCode, login.statusCode]).toEqual([503, 503]);
    expect(me.json()).toEqual({ status: "unavailable" });
    await app.close();
    await deadMongo.close();
  });

  it("leaves other errors to Fastify (a malformed body is still 400)", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, payload: "{nope" });
    expect(res.statusCode).toBe(400);
  });

  it("health reports 503 within the server selection timeout", async () => {
    const deadMongo = new MongoClient("mongodb://127.0.0.1:1", { serverSelectionTimeoutMS: 300 });
    const app = await ctx.makeApp({ db: deadMongo.db() });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    await app.close();
    await deadMongo.close();
  });
});

describe("event loop overload", () => {
  it("sheds with 503 and retry-after while lagging, before touching stock", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const app = await ctx.makeApp({ maxEventLoopLagMs: 50 });

    // Saturate like real overload: every tick late by ~100ms, for longer
    // than one 500ms sampling window.
    const end = Date.now() + 1_200;
    while (Date.now() < end) {
      const blockUntil = Date.now() + 100;
      while (Date.now() < blockUntil);
      await new Promise((resolve) => setImmediate(resolve));
    }

    const shed = await app.inject({ method: "POST", url: "/api/purchase", headers: ctx.as("arief") });
    expect(shed.statusCode).toBe(503);
    expect(shed.headers["retry-after"]).toBe("1");
    expect(shed.json()).toEqual({ status: "unavailable" });
    expect((await ctx.saleGate.getSnapshot()).stockLeft).toBe(10);
    await app.close();
  });

  it("does not shed when the loop is healthy", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    // An idle loop measures ~0ms once the sampling interval is subtracted;
    // counting the interval instead would read ~20ms and trip this.
    const app = await ctx.makeApp({ maxEventLoopLagMs: 15 });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect((await app.inject({ method: "GET", url: "/api/sale" })).statusCode).toBe(200);
    await app.close();
  });
});

describe("caching", () => {
  it("lets a CDN hold sale status for 1s but makes browsers refetch", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 10 });
    const res = await ctx.app.inject({ method: "GET", url: "/api/sale" });
    expect(res.headers["cache-control"]).toBe("public, max-age=0, s-maxage=1");
  });

  it("serves the product from memory for 60s, then rereads Mongo", async () => {
    let clock = 1_000;
    const app = Fastify();
    registerProductRoute(app, { db: ctx.db, now: () => clock });
    const name = async () => (await app.inject({ method: "GET", url: "/api/product" })).json().name;

    await saveProduct(ctx.db, PRODUCT);
    expect(await name()).toBe("Cached Hi-Top");

    await saveProduct(ctx.db, { ...PRODUCT, name: "Re-seeded" });
    clock += 59_999;
    expect(await name()).toBe("Cached Hi-Top");

    clock += 1;
    expect(await name()).toBe("Re-seeded");
    await app.close();
  });

  it("never caches not-found, so a seed shows up on the next request", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/product" });
    expect(res.statusCode).toBe(404);

    await saveProduct(ctx.db, PRODUCT);
    expect((await ctx.app.inject({ method: "GET", url: "/api/product" })).statusCode).toBe(200);
  });
});
