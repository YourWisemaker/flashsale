import fc from "fast-check";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { SALE_BUYERS_KEY, SALE_STOCK_KEY } from "../keys.js";
import { SaleGate } from "../sale-gate.js";

/**
 * Property-based tests: fast-check generates hundreds of random
 * scenarios and shrinks any failure to the smallest one that breaks.
 * Each run is checked against a plain in-memory reference model of
 * the rules, so this tests the Lua scripts against the spec rather
 * than against hand-picked examples.
 *
 * Real Redis, db 11 (separate from sale-gate.test.ts on db 15).
 */
const redis = new Redis(process.env.TEST_REDIS_URL ?? "redis://localhost:6379", { db: 11 });
let gate: SaleGate;

afterAll(async () => {
  await redis.flushdb();
  await redis.quit();
});

async function openSale(totalStock: number) {
  await redis.flushdb();
  gate = new SaleGate(redis);
  await gate.configure({
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 60_000),
    totalStock,
  });
}

// A small pool forces lots of repeat users, which is where bugs hide.
const userId = fc.constantFrom("u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7");

type Command = { kind: "purchase" | "release"; userId: string };
const command: fc.Arbitrary<Command> = fc.record({ kind: fc.constantFrom("purchase", "release"), userId });

/** The rules, written as plainly as possible. */
class ReferenceModel {
  private readonly buyers = new Set<string>();
  constructor(private stock: number) {}

  purchase(id: string): string {
    if (this.buyers.has(id)) return "already_purchased";
    if (this.stock <= 0) return "sold_out";
    this.stock -= 1;
    this.buyers.add(id);
    return "reserved";
  }

  release(id: string): void {
    if (!this.buyers.delete(id)) return;
    this.stock += 1;
  }

  snapshot() {
    return { stock: this.stock, buyers: [...this.buyers].sort() };
  }
}

describe("SaleGate properties", () => {
  it("matches the reference model for any sequence of purchases and releases", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 5 }), fc.array(command, { maxLength: 40 }), async (stock, commands) => {
        await openSale(stock);
        const model = new ReferenceModel(stock);

        for (const cmd of commands) {
          if (cmd.kind === "release") {
            await gate.release(cmd.userId);
            model.release(cmd.userId);
            continue;
          }
          const { outcome } = await gate.purchase(cmd.userId);
          expect(outcome).toBe(model.purchase(cmd.userId));
        }

        const buyers = (await redis.smembers(SALE_BUYERS_KEY)).sort();
        expect({ stock: Number(await redis.get(SALE_STOCK_KEY)), buyers }).toEqual(model.snapshot());
      }),
      { numRuns: 150 },
    );
  });

  it("never oversells or double-sells under any concurrent burst", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 20 }), fc.array(userId, { maxLength: 120 }), async (stock, ids) => {
        await openSale(stock);

        const results = await Promise.all(ids.map((id) => gate.purchase(id).then((r) => ({ id, ...r }))));
        const winners = results.filter((r) => r.outcome === "reserved").map((r) => r.id);
        const uniqueUsers = new Set(ids).size;

        // Exactly as many winners as the rules allow, no more, no fewer.
        expect(winners.length).toBe(Math.min(stock, uniqueUsers));
        // Nobody wins twice.
        expect(new Set(winners).size).toBe(winners.length);
        // Redis agrees with what callers were told.
        expect(Number(await redis.get(SALE_STOCK_KEY))).toBe(stock - winners.length);
        expect((await redis.smembers(SALE_BUYERS_KEY)).sort()).toEqual([...winners].sort());
        // Every loser got a reason that matches the final state.
        for (const r of results.filter((r) => r.outcome !== "reserved")) {
          expect(["already_purchased", "sold_out"]).toContain(r.outcome);
          if (r.outcome === "already_purchased") expect(winners).toContain(r.id);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("rejects every purchase outside the sale window and never touches stock", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.integer({ min: 1, max: 10 }), fc.array(userId, { maxLength: 20 }), async (before, stock, ids) => {
        await redis.flushdb();
        gate = new SaleGate(redis);
        const offset = before ? 60_000 : -120_000;
        await gate.configure({ startsAt: new Date(Date.now() + offset), endsAt: new Date(Date.now() + offset + 60_000), totalStock: stock });

        const outcomes = await Promise.all(ids.map((id) => gate.purchase(id).then((r) => r.outcome)));

        expect(outcomes.every((o) => o === (before ? "upcoming" : "ended"))).toBe(true);
        expect(Number(await redis.get(SALE_STOCK_KEY))).toBe(stock);
        expect(await redis.scard(SALE_BUYERS_KEY)).toBe(0);
      }),
      { numRuns: 50 },
    );
  });
});
