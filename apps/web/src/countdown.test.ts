import { describe, expect, it } from "vitest";
import { countdownParts } from "./countdown.js";

const NOW = Date.parse("2026-11-18T10:00:00.000Z");
const inMs = (ms: number) => new Date(NOW + ms).toISOString();

describe("countdownParts", () => {
  it("splits into zero-padded hours, minutes and seconds", () => {
    expect(countdownParts(inMs((1 * 3600 + 2 * 60 + 3) * 1000), NOW)).toEqual({ hours: "01", minutes: "02", seconds: "03" });
  });

  it("rounds partial seconds down", () => {
    expect(countdownParts(inMs(9_999), NOW)).toEqual({ hours: "00", minutes: "00", seconds: "09" });
  });

  it("clamps to zero once the target has passed", () => {
    expect(countdownParts(inMs(0), NOW)).toEqual({ hours: "00", minutes: "00", seconds: "00" });
    expect(countdownParts(inMs(-5_000), NOW)).toEqual({ hours: "00", minutes: "00", seconds: "00" });
  });

  it("keeps counting hours past a day instead of wrapping", () => {
    expect(countdownParts(inMs(30 * 3600 * 1000), NOW).hours).toBe("30");
  });
});
