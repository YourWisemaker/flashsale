import { describe, expect, it } from "vitest";
import { formatCountdown } from "./countdown.js";

const NOW = Date.parse("2026-11-18T10:00:00.000Z");
const inMs = (ms: number) => new Date(NOW + ms).toISOString();

describe("formatCountdown", () => {
  it("formats minutes and seconds with zero padding", () => {
    expect(formatCountdown(inMs(65_000), NOW)).toBe("01:05");
  });

  it("rounds partial seconds down", () => {
    expect(formatCountdown(inMs(9_999), NOW)).toBe("00:09");
  });

  it("clamps to 00:00 once the target has passed", () => {
    expect(formatCountdown(inMs(0), NOW)).toBe("00:00");
    expect(formatCountdown(inMs(-5_000), NOW)).toBe("00:00");
  });

  it("keeps counting minutes past an hour instead of wrapping", () => {
    expect(formatCountdown(inMs(61 * 60_000), NOW)).toBe("61:00");
  });
});
