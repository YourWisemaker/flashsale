export interface SaleConfig {
  startsAt: Date;
  endsAt: Date;
  totalStock: number;
}

/** Public status of the sale, independent of any one user. */
export type SaleStatus = "upcoming" | "active" | "ended" | "sold_out";

export interface SaleSnapshot {
  status: SaleStatus;
  startsAt: string;
  endsAt: string;
  totalStock: number;
  stockLeft: number;
}

/** Outcome of one purchase attempt, decided atomically inside Redis. */
export type PurchaseOutcome =
  | "reserved"
  | "already_purchased"
  | "sold_out"
  | "upcoming"
  | "ended"
  | "not_configured";

export interface PurchaseResult {
  outcome: PurchaseOutcome;
  stockLeft?: number;
}

/** Per-user order status, combining the Redis reservation and the Mongo record. */
export type UserOrderStatus = "none" | "pending" | "confirmed";
