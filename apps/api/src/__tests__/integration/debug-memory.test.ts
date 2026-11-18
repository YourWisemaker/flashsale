import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryTracker } from "../../libs/memory-tracker/index.js";
import { activeWindow, setupTestApp } from "./test-helpers.js";

const ctx = await setupTestApp();

afterAll(ctx.teardown);
beforeEach(ctx.reset);

describe("GET /debug/memory", () => {
  it("doesn't exist unless the tracker is on", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/debug/memory" })).statusCode).toBe(404);
  });

  it("counts requests per route, including unmatched ones", async () => {
    await ctx.saleGate.configure({ ...activeWindow(), totalStock: 5 });
    const app = await ctx.makeApp({ memoryTracker: new MemoryTracker() });

    await app.inject({ method: "GET", url: "/api/sale" });
    await app.inject({ method: "GET", url: "/api/sale" });
    await app.inject({ method: "GET", url: "/nope" });
    const res = await app.inject({ method: "GET", url: "/debug/memory" });

    expect(res.statusCode).toBe(200);
    const { labels, process } = res.json();
    expect(labels["GET /api/sale"].created).toBe(2);
    expect(labels["GET unmatched"].created).toBe(1);
    expect(labels["GET /debug/memory"].created).toBe(1);
    expect(process.heapUsedMb).toBeGreaterThan(0);
    await app.close();
  });
});
