import { describe, expect, it } from "vitest";
import { isOverloaded } from "../../load-shedding.js";

describe("isOverloaded", () => {
  it("sheds only when lag is strictly past the limit", () => {
    expect(isOverloaded(201, 200)).toBe(true);
    expect(isOverloaded(200, 200)).toBe(false);
    expect(isOverloaded(0, 200)).toBe(false);
  });

  it("never sheds when the limit is 0 (off)", () => {
    expect(isOverloaded(10_000, 0)).toBe(false);
  });

  it("does not shed before the first sample (NaN lag)", () => {
    expect(isOverloaded(Number.NaN, 200)).toBe(false);
  });
});
