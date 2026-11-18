import Redis from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SaleGate } from "../sale-gate.js";

// Runs against a real Redis (db 15, kept separate from dev data on db 0).
// Requires Redis to be running locally: `redis-server` or `docker compose up -d redis`.
const redis = new Redis(process.env.TEST_REDIS_URL ?? "redis://localhost:6379", { db: 15 });
// Built per test, not at import: a gate created at module load would
// skip anything Stryker mutates in the constructor.
let gate: SaleGate;

function activeWindow() {
  return { startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000) };
}

beforeEach(async () => {
  await redis.flushdb();
  gate = new SaleGate(redis);
});

afterAll(async () => {
  await redis.flushdb();
  await redis.quit();
});

describe("SaleGate.purchase", () => {
  it("returns upcoming before the sale starts", async () => {
    await gate.configure({ startsAt: new Date(Date.now() + 60_000), endsAt: new Date(Date.now() + 120_000), totalStock: 10 });
    expect(await gate.purchase("arief")).toEqual({ outcome: "upcoming" });
  });

  it("returns ended after the sale ends", async () => {
    await gate.configure({ startsAt: new Date(Date.now() - 120_000), endsAt: new Date(Date.now() - 60_000), totalStock: 10 });
    expect(await gate.purchase("arief")).toEqual({ outcome: "ended" });
  });

  it("reserves a unit and decrements stock", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 10 });
    expect(await gate.purchase("arief")).toEqual({ outcome: "reserved", stockLeft: 9 });
  });

  it("refuses a second purchase from the same user", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 10 });
    await gate.purchase("arief");
    expect(await gate.purchase("arief")).toEqual({ outcome: "already_purchased" });
  });

  it("returns sold_out once stock reaches zero", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 1 });
    await gate.purchase("arief");
    expect(await gate.purchase("boss")).toEqual({ outcome: "sold_out" });
  });

  it("never oversells under concurrent requests for the same stock", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 50 });
    const userIds = Array.from({ length: 200 }, (_, i) => `user-${i}`);

    const results = await Promise.all(userIds.map((id) => gate.purchase(id)));
    const reserved = results.filter((r) => r.outcome === "reserved");
    const soldOut = results.filter((r) => r.outcome === "sold_out");

    expect(reserved).toHaveLength(50);
    expect(soldOut).toHaveLength(150);
    expect(await redis.get("sale:stock")).toBe("0");
  });

  it("never lets one user win more than once under concurrent requests", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 50 });

    const results = await Promise.all(Array.from({ length: 30 }, () => gate.purchase("same-user")));
    const reserved = results.filter((r) => r.outcome === "reserved");

    expect(reserved).toHaveLength(1);
    expect(await redis.get("sale:stock")).toBe("49");
  });

  it("returns not_configured when no sale has been seeded", async () => {
    expect(await gate.purchase("arief")).toEqual({ outcome: "not_configured" });
  });
});

describe("SaleGate.release", () => {
  it("gives the unit back and lets the user try again", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 5 });
    await gate.purchase("arief");

    expect(await gate.release("arief")).toBe(true);

    expect(await redis.get("sale:stock")).toBe("5");
    expect(await gate.purchase("arief")).toEqual({ outcome: "reserved", stockLeft: 4 });
  });

  it("is a no-op for a user who never reserved", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 5 });
    expect(await gate.release("never-bought")).toBe(false);
    expect(await redis.get("sale:stock")).toBe("5");
  });
});

describe("SaleGate.getSnapshot", () => {
  it("reports active with correct stock counts", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 10 });
    await gate.purchase("arief");

    const snapshot = await gate.getSnapshot();
    expect(snapshot.status).toBe("active");
    expect(snapshot.totalStock).toBe(10);
    expect(snapshot.stockLeft).toBe(9);
  });

  it("reports sold_out once stock hits zero inside the window", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 1 });
    await gate.purchase("arief");

    expect((await gate.getSnapshot()).status).toBe("sold_out");
  });
});

describe("SaleGate.isReserved", () => {
  it("is true only for a user holding a reservation", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 5 });
    await gate.purchase("arief");

    expect(await gate.isReserved("arief")).toBe(true);
    expect(await gate.isReserved("boss")).toBe(false);
  });

  it("is false again after the reservation is released", async () => {
    await gate.configure({ ...activeWindow(), totalStock: 5 });
    await gate.purchase("arief");
    await gate.release("arief");

    expect(await gate.isReserved("arief")).toBe(false);
  });
});

describe("SaleGate.getSnapshot boundaries (fixed clock)", () => {
  const START = Date.parse("2026-11-18T10:00:00.000Z");
  const END = Date.parse("2026-11-18T11:00:00.000Z");
  const snapshotAt = async (now: number, totalStock = 10) => {
    await new SaleGate(redis).configure({ startsAt: new Date(START), endsAt: new Date(END), totalStock });
    return new SaleGate(redis, () => now).getSnapshot();
  };

  it("is upcoming one millisecond before the start", async () => {
    expect((await snapshotAt(START - 1)).status).toBe("upcoming");
  });

  it("is active exactly at the start and exactly at the end, like purchase.lua", async () => {
    expect((await snapshotAt(START)).status).toBe("active");
    expect((await snapshotAt(END)).status).toBe("active");
  });

  it("is ended one millisecond after the end", async () => {
    expect((await snapshotAt(END + 1)).status).toBe("ended");
  });

  it("reports the window and stock as configured", async () => {
    expect(await snapshotAt(START, 7)).toEqual({
      status: "active",
      startsAt: new Date(START).toISOString(),
      endsAt: new Date(END).toISOString(),
      totalStock: 7,
      stockLeft: 7,
    });
  });

  it("reports an unconfigured sale as ended with no stock, without throwing", async () => {
    const snapshot = await new SaleGate(redis, () => START).getSnapshot();
    expect(snapshot).toMatchObject({ status: "ended", totalStock: 0, stockLeft: 0 });
  });
});
