import { describe, expect, it } from "vitest";
import { toPurchaseResponse } from "../../purchase-response.js";

describe("toPurchaseResponse", () => {
  it.each([
    ["reserved", 202, "pending"],
    ["already_purchased", 409, "already_purchased"],
    ["sold_out", 410, "sold_out"],
    ["upcoming", 403, "upcoming"],
    ["ended", 403, "ended"],
    ["not_configured", 503, "unavailable"],
  ] as const)("maps %s to %i / %s", (outcome, httpCode, status) => {
    expect(toPurchaseResponse(outcome)).toEqual({ httpCode, status });
  });
});
