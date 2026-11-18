import { afterEach, describe, expect, it, vi } from "vitest";
import { attemptPurchase } from "./api.js";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attemptPurchase", () => {
  it("reads the outcome from the body status, whatever the HTTP code", async () => {
    respondWith(202, { status: "pending", stockLeft: 9 });
    expect(await attemptPurchase("arief")).toEqual({ status: "pending", stockLeft: 9 });

    respondWith(409, { status: "already_purchased" });
    expect((await attemptPurchase("arief")).status).toBe("already_purchased");

    respondWith(429, { statusCode: 429, status: "rate_limited" });
    expect((await attemptPurchase("arief")).status).toBe("rate_limited");
  });

  it("maps the 400 error shape to invalid_user", async () => {
    respondWith(400, { error: "invalid_user", message: "userId is required" });
    expect((await attemptPurchase("")).status).toBe("invalid_user");
  });

  it("falls back to error on a non-JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    expect((await attemptPurchase("arief")).status).toBe("error");
  });

  it("falls back to error when the network call itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect((await attemptPurchase("arief")).status).toBe("error");
  });
});
