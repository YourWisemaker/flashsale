export interface PurchaseAttemptResult {
  userId: string;
  httpStatus: number;
  status: string;
  latencyMs: number;
}

export async function attemptPurchase(apiUrl: string, userId: string): Promise<PurchaseAttemptResult> {
  const startedAt = performance.now();
  try {
    const res = await fetch(`${apiUrl}/api/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
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
