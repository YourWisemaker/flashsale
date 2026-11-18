import { describe, expect, it } from "vitest";
import { deriveUserOrderStatus } from "../user-order-status.js";

describe("deriveUserOrderStatus", () => {
  it("is none when the user never reserved", () => {
    expect(deriveUserOrderStatus({ isReserved: false, hasConfirmedOrder: false })).toBe("none");
  });

  it("is pending when reserved but not yet confirmed by the worker", () => {
    expect(deriveUserOrderStatus({ isReserved: true, hasConfirmedOrder: false })).toBe("pending");
  });

  it("is confirmed once the order exists, regardless of the reservation flag", () => {
    expect(deriveUserOrderStatus({ isReserved: true, hasConfirmedOrder: true })).toBe("confirmed");
    expect(deriveUserOrderStatus({ isReserved: false, hasConfirmedOrder: true })).toBe("confirmed");
  });
});
