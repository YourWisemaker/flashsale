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
  | "unauthorized"
  | "in_progress"
  | "rate_limited"
  | "error";

export interface PurchaseResult {
  status: PurchaseStatus;
  stockLeft?: number;
}

export type UserOrderStatus = "none" | "pending" | "confirmed";

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

/** Result of an auth call: the logged-in email, or the API's message for the user. */
export type AuthResult = { ok: true; email: string } | { ok: false; message: string };

const NETWORK_ERROR = "Couldn't reach the server. Try again.";
const json = { "Content-Type": "application/json" };

export async function fetchSale(): Promise<SaleSnapshot> {
  const res = await fetch("/api/sale");
  return res.json();
}

/** Null when the API has no product seeded (404); the page still works without it. */
export async function fetchProduct(): Promise<Product | null> {
  const res = await fetch("/api/product");
  if (!res.ok) return null;
  return res.json();
}

/**
 * Buys as whoever the session cookie says; there's no user id to send.
 * `idempotencyKey` is one per click: if the network drops and the request
 * is retried with the same key, the server returns the original answer
 * instead of "already purchased". One automatic retry on a network error.
 */
export async function attemptPurchase(idempotencyKey: string): Promise<PurchaseResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch("/api/purchase", { method: "POST", headers: { "Idempotency-Key": idempotencyKey } });
      const body = await res.json().catch(() => ({}));

      if (typeof body.status === "string") return { status: body.status, stockLeft: body.stockLeft };
      if (body.error === "unauthorized") return { status: "unauthorized" };
      return { status: "error" };
    } catch {
      if (attempt === 2) return { status: "error" };
    }
  }
}

export async function fetchMyStatus(): Promise<UserOrderStatus> {
  const res = await fetch("/api/purchase/me");
  const body = await res.json();
  return body.status;
}

/** The logged-in email, or null. */
export async function fetchMe(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    return (await res.json()).email;
  } catch {
    return null;
  }
}

async function authCall(path: string, body: object): Promise<AuthResult> {
  try {
    const res = await fetch(path, { method: "POST", headers: json, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.email === "string") return { ok: true, email: data.email };
    return { ok: false, message: typeof data.message === "string" ? data.message : NETWORK_ERROR };
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
}

export const login = (email: string, password: string) => authCall("/api/auth/login", { email, password });
export const register = (email: string, password: string) => authCall("/api/auth/register", { email, password });
export const resetPassword = (token: string, password: string) => authCall("/api/auth/reset", { token, password });

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/** Always resolves to the message to show; the API answers the same whether or not the email has an account. */
export async function forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: json, body: JSON.stringify({ email }) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, message: typeof data.message === "string" ? data.message : NETWORK_ERROR };
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
}
