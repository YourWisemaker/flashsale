export type SaleStatus = "upcoming" | "active" | "ended" | "sold_out";

export interface SaleSnapshot {
  status: SaleStatus;
  startsAt: string;
  endsAt: string;
  totalStock: number;
  stockLeft: number;
}

export type PurchaseStatus =
  | "pending"
  | "already_purchased"
  | "sold_out"
  | "upcoming"
  | "ended"
  | "unavailable"
  | "invalid_user"
  | "rate_limited"
  | "error";

export interface PurchaseResult {
  status: PurchaseStatus;
  stockLeft?: number;
}

export type UserOrderStatus = "none" | "pending" | "confirmed";

export async function fetchSale(): Promise<SaleSnapshot> {
  const res = await fetch("/api/sale");
  return res.json();
}

export async function attemptPurchase(userId: string): Promise<PurchaseResult> {
  try {
    const res = await fetch("/api/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const body = await res.json().catch(() => ({}));

    if (typeof body.status === "string") return { status: body.status, stockLeft: body.stockLeft };
    if (body.error === "invalid_user") return { status: "invalid_user" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export async function fetchUserStatus(userId: string): Promise<UserOrderStatus> {
  const res = await fetch(`/api/purchase/${encodeURIComponent(userId)}`);
  const body = await res.json();
  return body.status;
}

export interface Product {
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  originalPriceCents: number;
  currency: string;
  images: { url: string; alt: string }[];
  specs: { label: string; value: string }[];
}

/** Null when the API has no product seeded (404); the page still works without it. */
export async function fetchProduct(): Promise<Product | null> {
  const res = await fetch("/api/product");
  if (!res.ok) return null;
  return res.json();
}
