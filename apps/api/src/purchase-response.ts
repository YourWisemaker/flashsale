import type { PurchaseOutcome } from "@flashsale/core";

export interface PurchaseResponse {
  httpCode: number;
  status: string;
}

/**
 * The one place that turns a Redis-decided outcome into an HTTP
 * response. Table lookup instead of a chain of if/else: adding an
 * outcome later means adding one row here, not a new branch.
 */
const OUTCOME_TABLE: Record<PurchaseOutcome, PurchaseResponse> = {
  reserved: { httpCode: 202, status: "pending" },
  already_purchased: { httpCode: 409, status: "already_purchased" },
  sold_out: { httpCode: 410, status: "sold_out" },
  upcoming: { httpCode: 403, status: "upcoming" },
  ended: { httpCode: 403, status: "ended" },
  not_configured: { httpCode: 503, status: "unavailable" },
};

export function toPurchaseResponse(outcome: PurchaseOutcome): PurchaseResponse {
  return OUTCOME_TABLE[outcome];
}
