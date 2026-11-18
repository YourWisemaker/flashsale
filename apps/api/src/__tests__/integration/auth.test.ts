import { createUser, readOutbox, SESSION_COOKIE } from "@flashsale/core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./test-helpers.js";

const ctx = await setupTestApp();

afterAll(ctx.teardown);
beforeEach(ctx.reset);

const post = (url: string, payload?: object, headers?: Record<string, string>) => ctx.app.inject({ method: "POST", url, payload, headers });

/** The session cookie a response set, as a Cookie header for the next request. */
function sessionFrom(res: { cookies: { name: string; value: string }[] }) {
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  return cookie ? { cookie: `${SESSION_COOKIE}=${cookie.value}` } : undefined;
}

const me = async (headers?: Record<string, string>) => (await ctx.app.inject({ method: "GET", url: "/api/auth/me", headers })).json();

describe("register", () => {
  it("creates the account, normalizes the email, and logs the user in", async () => {
    const res = await post("/api/auth/register", { email: " Arief@Example.com ", password: "correct-horse" });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ email: "arief@example.com" });
    expect(await me(sessionFrom(res))).toEqual({ email: "arief@example.com" });
  });

  it("sets an httpOnly, SameSite=Strict session cookie for a week", async () => {
    const res = await post("/api/auth/register", { email: "arief@example.com", password: "correct-horse" });
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/", maxAge: 604800 });
    expect(cookie?.secure).toBeFalsy();
  });

  it("marks the cookie Secure when configured for HTTPS", async () => {
    const httpsApp = await ctx.makeApp({ cookieSecure: true });
    const res = await httpsApp.inject({ method: "POST", url: "/api/auth/register", payload: { email: "arief@example.com", password: "correct-horse" } });
    expect(res.cookies.find((c) => c.name === SESSION_COOKIE)?.secure).toBe(true);
    await httpsApp.close();
  });

  it("refuses a second account for the same email", async () => {
    await post("/api/auth/register", { email: "arief@example.com", password: "correct-horse" });
    const res = await post("/api/auth/register", { email: "ARIEF@example.com", password: "another-pass" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "email_taken", message: "That email already has an account. Log in, or reset your password." });
    expect(res.cookies).toHaveLength(0);
  });

  it.each([
    [{ email: "not-an-email", password: "correct-horse" }, "invalid_email", "Enter a valid email address."],
    [{ password: "correct-horse" }, "invalid_email", "Enter a valid email address."],
    [{ email: "arief@example.com", password: "short" }, "weak_password", "Password must be at least 8 characters."],
    [{ email: "arief@example.com" }, "weak_password", "Password is required."],
  ])("rejects %j with 400 %s", async (payload, error, message) => {
    const res = await post("/api/auth/register", payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error, message });
  });
});

describe("login / me / logout", () => {
  beforeEach(async () => {
    await createUser(ctx.db, "arief@example.com", "correct-horse");
  });

  it("logs in with the right password, case-insensitively on the email", async () => {
    const res = await post("/api/auth/login", { email: "ARIEF@example.com", password: "correct-horse" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email: "arief@example.com" });
    expect(await me(sessionFrom(res))).toEqual({ email: "arief@example.com" });
  });

  it.each([
    { email: "arief@example.com", password: "wrong-password" },
    { email: "nobody@example.com", password: "correct-horse" },
    { email: "not-an-email", password: "correct-horse" },
    { email: "arief@example.com" },
    {},
  ])("gives one answer for every failure, without saying which part was wrong (%j)", async (payload) => {
    const res = await post("/api/auth/login", payload);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_credentials", message: "Wrong email or password." });
    expect(res.cookies).toHaveLength(0);
  });

  it("me is 401 without a session", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized", message: "Not logged in." });
  });

  it("logout clears the session cookie", async () => {
    const res = await post("/api/auth/logout");
    expect(res.statusCode).toBe(204);
    const cleared = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cleared?.value).toBe("");
    // Must match the path it was set with, or the browser keeps the old cookie.
    expect(cleared?.path).toBe("/");
    expect(new Date(cleared!.expires!).getTime()).toBeLessThan(Date.now());
  });

  it("rate limits login attempts per IP", async () => {
    const limited = await ctx.makeApp({ authRateLimitMax: 2 });
    const attempt = () => limited.inject({ method: "POST", url: "/api/auth/login", payload: { email: "arief@example.com", password: "guess-1234" } });
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ statusCode: 429, status: "rate_limited", message: "Too many attempts. Wait a moment and try again." });
    await limited.close();
  });

  it("behind a proxy (trustProxy), limits each client IP from X-Forwarded-For, not the proxy's", async () => {
    const behindProxy = await ctx.makeApp({ authRateLimitMax: 1, trustProxy: true });
    const attemptFrom = (ip: string) =>
      behindProxy.inject({ method: "POST", url: "/api/auth/login", headers: { "x-forwarded-for": ip }, payload: { email: "arief@example.com", password: "guess-1234" } });

    expect((await attemptFrom("203.0.113.1")).statusCode).toBe(401);
    expect((await attemptFrom("203.0.113.1")).statusCode).toBe(429);
    // A different user behind the same proxy isn't blocked by the first one.
    expect((await attemptFrom("203.0.113.2")).statusCode).toBe(401);
    await behindProxy.close();
  });

  it("without trustProxy, ignores X-Forwarded-For (a client can't dodge the limit by faking it)", async () => {
    const direct = await ctx.makeApp({ authRateLimitMax: 1 });
    const attemptAs = (ip: string) =>
      direct.inject({ method: "POST", url: "/api/auth/login", headers: { "x-forwarded-for": ip }, payload: { email: "arief@example.com", password: "guess-1234" } });

    expect((await attemptAs("203.0.113.1")).statusCode).toBe(401);
    expect((await attemptAs("203.0.113.2")).statusCode).toBe(429);
    await direct.close();
  });
});

describe("forgot password", () => {
  it("emails a single-use reset link to a registered user", async () => {
    await createUser(ctx.db, "arief@example.com", "correct-horse");
    const res = await post("/api/auth/forgot", { email: "Arief@example.com" });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: "sent", message: "If that email has an account, a reset link is on its way." });
    const [mail] = await readOutbox(ctx.db, "arief@example.com");
    expect(mail.subject).toBe("Reset your Arief Shop password");
    expect(mail.text).toMatch(/https:\/\/shop\.test\/reset-password\?token=[\w-]{43}\n/);
    expect(mail.text).toContain("expires in 30 minutes");
  });

  it("answers the same for an unknown email, and sends nothing", async () => {
    const res = await post("/api/auth/forgot", { email: "nobody@example.com" });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: "sent", message: "If that email has an account, a reset link is on its way." });
    expect(await readOutbox(ctx.db)).toEqual([]);
  });

  it("rejects a malformed email", async () => {
    const res = await post("/api/auth/forgot", { email: "nope" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_email", message: "Enter a valid email address." });
  });
});

describe("reset password", () => {
  async function resetLinkToken() {
    await createUser(ctx.db, "arief@example.com", "old-password");
    await post("/api/auth/forgot", { email: "arief@example.com" });
    const [mail] = await readOutbox(ctx.db, "arief@example.com");
    return /token=([\w-]+)/.exec(mail.text)![1];
  }

  it("sets the new password from the emailed link and logs the user in", async () => {
    const token = await resetLinkToken();
    const res = await post("/api/auth/reset", { token, password: "new-password" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email: "arief@example.com" });
    expect(await me(sessionFrom(res))).toEqual({ email: "arief@example.com" });
    expect((await post("/api/auth/login", { email: "arief@example.com", password: "new-password" })).statusCode).toBe(200);
    expect((await post("/api/auth/login", { email: "arief@example.com", password: "old-password" })).statusCode).toBe(401);
  });

  it("works only once", async () => {
    const token = await resetLinkToken();
    await post("/api/auth/reset", { token, password: "new-password" });
    const again = await post("/api/auth/reset", { token, password: "another-one" });

    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ error: "invalid_token", message: "This reset link is invalid or has expired. Ask for a new one." });
  });

  it("doesn't burn the link when the new password is too short", async () => {
    const token = await resetLinkToken();
    const weak = await post("/api/auth/reset", { token, password: "short" });
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toEqual({ error: "weak_password", message: "Password must be at least 8 characters." });

    expect((await post("/api/auth/reset", { token, password: "long-enough" })).statusCode).toBe(200);
  });

  it.each([{ token: "made-up", password: "new-password" }, { password: "new-password" }])("rejects a bad token (%j)", async (payload) => {
    const res = await post("/api/auth/reset", payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_token");
  });
});

describe("requests with no body at all", () => {
  it.each([
    ["/api/auth/register", 400, { error: "invalid_email", message: "Enter a valid email address." }],
    ["/api/auth/login", 401, { error: "invalid_credentials", message: "Wrong email or password." }],
    ["/api/auth/forgot", 400, { error: "invalid_email", message: "Enter a valid email address." }],
    ["/api/auth/reset", 400, { error: "weak_password", message: "Password is required." }],
  ])("%s answers %i, not a crash", async (url, code, body) => {
    const res = await ctx.app.inject({ method: "POST", url });
    expect(res.statusCode).toBe(code);
    expect(res.json()).toEqual(body);
  });

  it("reset with a password but no token says the link is invalid", async () => {
    const res = await post("/api/auth/reset", { password: "long-enough" });
    expect(res.json()).toEqual({ error: "invalid_token", message: "This reset link is invalid or has expired. Ask for a new one." });
  });
});

describe("whole journey", () => {
  it("register, buy, then see your own status", async () => {
    await ctx.saleGate.configure({ startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000), totalStock: 3 });
    const session = sessionFrom(await post("/api/auth/register", { email: "arief@example.com", password: "correct-horse" }));

    expect((await post("/api/purchase", undefined, session)).statusCode).toBe(202);
    const status = await ctx.app.inject({ method: "GET", url: "/api/purchase/me", headers: session });
    expect(status.json()).toEqual({ userId: "arief@example.com", status: "pending" });
  });
});
