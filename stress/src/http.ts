import { SESSION_COOKIE } from "@flashsale/core";

export interface PurchaseAttemptResult {
  userId: string;
  httpStatus: number;
  status: string;
  latencyMs: number;
}

/**
 * Each virtual user carries a session cookie, as if they'd logged in
 * before the sale opened (which is what real flash-sale traffic looks
 * like). The token is minted up front so this measures the purchase path,
 * not password hashing.
 */
export async function attemptPurchase(apiUrl: string, userId: string, sessionToken: string): Promise<PurchaseAttemptResult> {
  const startedAt = performance.now();
  try {
    const res = await fetch(`${apiUrl}/api/purchase`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    const body = await res.json().catch(() => ({}));
    return {
      userId,
      httpStatus: res.status,
      status: body.status ?? body.error ?? "unknown",
      latencyMs: performance.now() - startedAt,
    };
  } catch {
    return { userId, httpStatus: 0, status: "network_error", latencyMs: performance.now() - startedAt };
  }
}
