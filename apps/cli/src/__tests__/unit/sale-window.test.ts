import { describe, expect, it } from "vitest";
import type { Args } from "../../command.js";
import { resolveSaleConfig } from "../../sale-window.js";

const NOW = Date.parse("2026-11-18T10:00:00.000Z");
const MINUTE = 60_000;
const args = (flags: Args["flags"] = {}, env: Args["env"] = {}): Args => ({ positionals: [], flags, env });

describe("resolveSaleConfig", () => {
  it("defaults to 100 units, starting in a minute, running an hour", () => {
    expect(resolveSaleConfig(args(), NOW)).toEqual({
      startsAt: new Date(NOW + MINUTE),
      endsAt: new Date(NOW + 61 * MINUTE),
      totalStock: 100,
    });
  });

  it("reads SALE_STOCK, SALE_START, SALE_END from env", () => {
    const config = resolveSaleConfig(args({}, { SALE_STOCK: "7", SALE_START: "2026-12-01T00:00:00Z", SALE_END: "2026-12-01T02:00:00Z" }), NOW);
    expect(config).toEqual({ startsAt: new Date("2026-12-01T00:00:00Z"), endsAt: new Date("2026-12-01T02:00:00Z"), totalStock: 7 });
  });

  it("lets flags override env", () => {
    const config = resolveSaleConfig(args({ stock: "3", start: "2026-12-02T00:00:00Z", end: "2026-12-02T01:00:00Z" }, { SALE_STOCK: "7", SALE_START: "2026-12-01T00:00:00Z" }), NOW);
    expect(config).toEqual({ startsAt: new Date("2026-12-02T00:00:00Z"), endsAt: new Date("2026-12-02T01:00:00Z"), totalStock: 3 });
  });

  it('accepts "now" and a duration in minutes', () => {
    expect(resolveSaleConfig(args({ start: "now", minutes: "30" }), NOW)).toEqual({
      startsAt: new Date(NOW),
      endsAt: new Date(NOW + 30 * MINUTE),
      totalStock: 100,
    });
  });

  it("treats an empty env value as unset", () => {
    expect(resolveSaleConfig(args({}, { SALE_START: "", SALE_END: "" }), NOW).startsAt).toEqual(new Date(NOW + MINUTE));
  });

  it("allows zero stock (a sold-out demo)", () => {
    expect(resolveSaleConfig(args({ stock: "0" }), NOW).totalStock).toBe(0);
  });

  it.each(["-1", "2.5", "lots"])("rejects stock %j", (stock) => {
    expect(() => resolveSaleConfig(args({ stock }), NOW)).toThrow(`Stock must be a whole number of 0 or more, got "${stock}"`);
  });

  it("rejects an unparseable date, naming which one", () => {
    expect(() => resolveSaleConfig(args({ start: "tomorrow" }), NOW)).toThrow('Sale start must be an ISO date like 2026-11-22T09:00:00Z, got "tomorrow"');
    expect(() => resolveSaleConfig(args({ end: "later" }), NOW)).toThrow('Sale end must be an ISO date');
  });

  it.each(["0", "-5", "soon"])("rejects --minutes %j", (minutes) => {
    expect(() => resolveSaleConfig(args({ minutes }), NOW)).toThrow(`Minutes must be more than 0, got "${minutes}"`);
  });

  it("rejects a window that ends before (or when) it starts", () => {
    expect(() => resolveSaleConfig(args({ start: "2026-12-01T01:00:00Z", end: "2026-12-01T01:00:00Z" }), NOW)).toThrow(
      "The sale must end after it starts (2026-12-01T01:00:00.000Z to 2026-12-01T01:00:00.000Z)",
    );
  });
});
