import { scryptSync } from "node:crypto";
import { createSigner } from "fast-jwt";
import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password.js";
import { createSessionTokens, SESSION_TTL_SECONDS } from "../auth/session.js";
import { normalizeEmail } from "../auth/users.js";

const SECRET = "test-secret-that-is-at-least-32-chars!";

describe("passwords", () => {
  it("hashes with scrypt and a random salt, never storing the password", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[\w-]{22}\$[\w-]{86}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("correct horse");
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("correct hors", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  const handMade = (scheme: string, salt: Buffer, n = 16384) =>
    [scheme, n, 8, 1, salt.toString("base64url"), scryptSync("pw", salt, 64, { N: n, r: 8, p: 1 }).toString("base64url")].join("$");

  it("verifies with the parameters stored in the hash, so they can be raised later", async () => {
    expect(await verifyPassword("pw", handMade("scrypt", Buffer.from("0123456789abcdef"), 1024))).toBe(true);
  });

  it("rejects a hash with another scheme name, even if the bytes would match", async () => {
    expect(await verifyPassword("pw", handMade("bcrypt", Buffer.from("0123456789abcdef")))).toBe(false);
  });

  it("rejects a hash with an empty salt, even if the bytes would match", async () => {
    expect(await verifyPassword("pw", handMade("scrypt", Buffer.alloc(0)))).toBe(false);
  });

  it.each(["", "bcrypt$x$y", "scrypt$16384$8$1$$", "scrypt$16384$8$1$salt", "plaintext"])("returns false for a malformed stored hash (%j) instead of throwing", async (stored) => {
    expect(await verifyPassword("anything", stored)).toBe(false);
  });

  it("rejects a hash with the right length but wrong bytes", async () => {
    const stored = await hashPassword("one");
    // Flip a character in the middle of the hash. Not the last one: its
    // low bits are base64 padding and may not change the decoded bytes.
    const at = stored.length - 20;
    const tampered = stored.slice(0, at) + (stored[at] === "A" ? "B" : "A") + stored.slice(at + 1);
    expect(await verifyPassword("one", tampered)).toBe(false);
  });

  it.each([
    [undefined, "Password is required."],
    [12345678, "Password is required."],
    ["1234567", "Password must be at least 8 characters."],
    ["x".repeat(129), "Password must be at most 128 characters."],
  ])("explains why %j isn't acceptable", (password, problem) => {
    expect(passwordProblem(password)).toBe(problem);
  });

  it("accepts 8 and 128 character passwords", () => {
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("x".repeat(128))).toBeNull();
  });
});

describe("session tokens", () => {
  // Built per call, not at file load, so mutation testing sees the constructor run.
  const tokens = () => createSessionTokens(SECRET);

  it("round-trips the email", () => {
    const t = tokens();
    expect(t.verify(t.sign("arief@example.com"))).toBe("arief@example.com");
  });

  it("expires after the session TTL", () => {
    const token = tokens().sign("arief@example.com");
    const [rawHeader, payload] = token.split(".");
    expect(JSON.parse(Buffer.from(rawHeader, "base64url").toString())).toMatchObject({ alg: "HS256" });
    const { iat, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(exp - iat).toBe(SESSION_TTL_SECONDS);
  });

  it("rejects missing, malformed, tampered, and foreign-key tokens", () => {
    const t = tokens();
    const token = t.sign("arief@example.com");
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "boss@example.com" })).toString("base64url");

    expect(t.verify(undefined)).toBeNull();
    expect(t.verify("")).toBeNull();
    expect(t.verify("not.a.jwt")).toBeNull();
    expect(t.verify(`${header}.${forgedPayload}.${signature}`)).toBeNull();
    expect(t.verify(createSessionTokens("another-secret-also-32-characters!!").sign("arief@example.com"))).toBeNull();
  });

  it('rejects an unsigned "alg: none" token', () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from('{"sub":"boss@example.com"}').toString("base64url")}.`;
    expect(tokens().verify(none)).toBeNull();
  });

  it("rejects a token signed with the right key but another algorithm", () => {
    const hs512 = createSigner({ key: SECRET, algorithm: "HS512" })({ sub: "arief@example.com" });
    expect(tokens().verify(hs512)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = createSigner({ key: SECRET, algorithm: "HS256" })({ sub: "arief@example.com", exp: Math.floor(Date.now() / 1000) - 10 });
    expect(tokens().verify(expired)).toBeNull();
  });

  it("rejects a validly signed token with no usable subject", () => {
    const sign = createSigner({ key: SECRET, algorithm: "HS256" });
    expect(tokens().verify(sign({ sub: 42 }))).toBeNull();
    expect(tokens().verify(sign({ name: "x" }))).toBeNull();
  });

  it("refuses a short secret at startup", () => {
    expect(() => createSessionTokens("short")).toThrow("AUTH_SECRET must be at least 32 characters.");
    expect(() => createSessionTokens("x".repeat(31))).toThrow("AUTH_SECRET must be at least 32 characters.");
    expect(() => createSessionTokens("x".repeat(32))).not.toThrow();
  });
});

describe("normalizeEmail", () => {
  it("normalizes like a userId and requires an email shape", () => {
    expect(normalizeEmail("  Arief@Example.COM ")).toBe("arief@example.com");
    expect(normalizeEmail("arief")).toBeNull();
    expect(normalizeEmail("arief@localhost")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
    expect(normalizeEmail("arief@.com")).toBeNull();
    expect(normalizeEmail("arief@example.")).toBeNull();
    expect(normalizeEmail("a b@example.com")).toBeNull();
    expect(normalizeEmail("a@b@example.com")).toBeNull();
    expect(normalizeEmail("a@example.com@b")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("auth constants other packages rely on", () => {
  it("pins the cookie name, session length, reset link length, and collection names", async () => {
    const reset = await import("../auth/password-reset.js");
    const users = await import("../auth/users.js");
    const outbox = await import("../auth/outbox.js");
    const session = await import("../auth/session.js");
    expect(session.SESSION_COOKIE).toBe("session");
    expect(session.SESSION_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(reset.RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
    expect([users.USERS_COLLECTION, reset.PASSWORD_RESETS_COLLECTION, outbox.OUTBOX_COLLECTION]).toEqual(["users", "password_resets", "outbox"]);
  });
});
