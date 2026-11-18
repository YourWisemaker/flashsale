import type { UserOrderStatus } from "./types.js";

/**
 * Pure mapping, no I/O: given what the two stores say about a user,
 * decide what to tell them. A confirmed Mongo order always wins even
 * if, for some reason, Redis no longer lists them as a buyer.
 */
export function deriveUserOrderStatus(input: { isReserved: boolean; hasConfirmedOrder: boolean }): UserOrderStatus {
  if (input.hasConfirmedOrder) return "confirmed";
  if (input.isReserved) return "pending";
  return "none";
}
