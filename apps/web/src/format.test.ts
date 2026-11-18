import { describe, expect, it } from "vitest";
import { discountPercent, formatPrice } from "./format.js";

describe("formatPrice", () => {
  it("formats integer cents as currency", () => {
    expect(formatPrice(8900, "USD")).toBe("$89.00");
    expect(formatPrice(14999, "USD")).toBe("$149.99");
  });

  it("uses the product's currency", () => {
    expect(formatPrice(8900, "EUR", "en-US")).toBe("€89.00");
  });
});

describe("discountPercent", () => {
  it("rounds down so the badge never overstates the discount", () => {
    expect(discountPercent(8900, 14900)).toBe(40); // 40.27%
    expect(discountPercent(6667, 10000)).toBe(33); // 33.33%
  });

  it("is zero when there's no real discount or no original price", () => {
    expect(discountPercent(10000, 10000)).toBe(0);
    expect(discountPercent(12000, 10000)).toBe(0);
    expect(discountPercent(5000, 0)).toBe(0);
  });
});
