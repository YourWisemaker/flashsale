import { afterEach, describe, expect, it, vi } from "vitest";
import { attemptPurchase, fetchMe, fetchProduct, forgotPassword, login, logout, register, resetPassword } from "./api.js";

const fetchMock = () => vi.mocked(globalThis.fetch);

function respondWith(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attemptPurchase", () => {
  const KEY = "key-1234-abcd";

  it("posts no body (the session cookie says who's buying), only the idempotency key", async () => {
    respondWith(202, { status: "pending", stockLeft: 9 });
    expect(await attemptPurchase(KEY)).toEqual({ status: "pending", stockLeft: 9 });
    expect(fetchMock()).toHaveBeenCalledWith("/api/purchase", { method: "POST", headers: { "Idempotency-Key": KEY } });
  });

  it("retries once on a network error, with the same key, so a lost response is recovered", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "pending", stockLeft: 9 }), { status: 202 }));
    vi.stubGlobal("fetch", fetchFn);

    expect(await attemptPurchase(KEY)).toEqual({ status: "pending", stockLeft: 9 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1]).toEqual(fetchFn.mock.calls[0]);
  });

  it("gives up after the second network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchFn);
    expect((await attemptPurchase(KEY)).status).toBe("error");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry an answer from the server, even an error one", async () => {
    respondWith(503, { status: "unavailable" });
    expect((await attemptPurchase(KEY)).status).toBe("unavailable");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("reads the outcome from the body status, whatever the HTTP code", async () => {
    respondWith(409, { status: "already_purchased" });
    expect((await attemptPurchase("key-1234-abcd")).status).toBe("already_purchased");
    respondWith(429, { statusCode: 429, status: "rate_limited" });
    expect((await attemptPurchase("key-1234-abcd")).status).toBe("rate_limited");
  });

  it("maps a 401 to unauthorized", async () => {
    respondWith(401, { error: "unauthorized", message: "Log in to continue." });
    expect((await attemptPurchase("key-1234-abcd")).status).toBe("unauthorized");
  });

  it("falls back to error on a non-JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    expect((await attemptPurchase("key-1234-abcd")).status).toBe("error");
  });
});

describe("fetchProduct", () => {
  it("returns the product on 200, null on 404", async () => {
    respondWith(200, { sku: "HT-1" });
    expect(await fetchProduct()).toEqual({ sku: "HT-1" });
    respondWith(404, { error: "not_found" });
    expect(await fetchProduct()).toBeNull();
  });
});

describe("auth calls", () => {
  it("fetchMe returns the email, or null when logged out or offline", async () => {
    respondWith(200, { email: "arief@example.com" });
    expect(await fetchMe()).toBe("arief@example.com");
    respondWith(401, { error: "unauthorized" });
    expect(await fetchMe()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await fetchMe()).toBeNull();
  });

  it.each([
    ["login", () => login("a@example.com", "pw-12345"), "/api/auth/login", { email: "a@example.com", password: "pw-12345" }],
    ["register", () => register("a@example.com", "pw-12345"), "/api/auth/register", { email: "a@example.com", password: "pw-12345" }],
    ["resetPassword", () => resetPassword("tok", "pw-12345"), "/api/auth/reset", { token: "tok", password: "pw-12345" }],
  ] as const)("%s posts JSON and returns the email on success", async (_name, call, path, body) => {
    respondWith(200, { email: "a@example.com" });
    expect(await call()).toEqual({ ok: true, email: "a@example.com" });
    expect(fetchMock()).toHaveBeenCalledWith(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  });

  it("returns the API's message on failure", async () => {
    respondWith(401, { error: "invalid_credentials", message: "Wrong email or password." });
    expect(await login("a@example.com", "x")).toEqual({ ok: false, message: "Wrong email or password." });
  });

  it("passes on the rate limiter's message instead of blaming the network", async () => {
    respondWith(429, { statusCode: 429, status: "rate_limited", message: "Too many attempts. Wait a moment and try again." });
    expect(await login("a@example.com", "x")).toEqual({ ok: false, message: "Too many attempts. Wait a moment and try again." });
  });

  it("returns a generic message when the API gives none or can't be reached", async () => {
    respondWith(500, {});
    expect(await login("a@example.com", "x")).toEqual({ ok: false, message: "Couldn't reach the server. Try again." });
    respondWith(200, { unexpected: true });
    expect(await login("a@example.com", "x")).toEqual({ ok: false, message: "Couldn't reach the server. Try again." });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await register("a@example.com", "x")).toEqual({ ok: false, message: "Couldn't reach the server. Try again." });
  });

  it("forgotPassword returns the API's message either way", async () => {
    respondWith(202, { status: "sent", message: "If that email has an account, a reset link is on its way." });
    expect(await forgotPassword("a@example.com")).toEqual({ ok: true, message: "If that email has an account, a reset link is on its way." });
    respondWith(400, { error: "invalid_email", message: "Enter a valid email address." });
    expect(await forgotPassword("nope")).toEqual({ ok: false, message: "Enter a valid email address." });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await forgotPassword("a@example.com")).toEqual({ ok: false, message: "Couldn't reach the server. Try again." });
  });

  it("logout posts and swallows network errors", async () => {
    respondWith(204, {});
    await logout();
    expect(fetchMock()).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await expect(logout()).resolves.toBeUndefined();
  });
});
