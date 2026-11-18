import type { Db, MongoClient } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readOutbox, sendMail, OUTBOX_COLLECTION } from "../auth/outbox.js";
import { consumeResetToken, createResetToken, ensureResetIndexes, PASSWORD_RESETS_COLLECTION, RESET_TOKEN_TTL_MS } from "../auth/password-reset.js";
import { checkCredentials, createUser, deleteUser, ensureUserIndexes, setPassword, userExists, USERS_COLLECTION } from "../auth/users.js";
import { connectMongo } from "../mongo.js";

const MONGO_URL = `${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test_core_auth`;

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  ({ client, db } = await connectMongo(MONGO_URL));
});

beforeEach(async () => {
  // Here, not in beforeAll: a failing beforeAll makes Vitest skip the
  // tests instead of failing them, which hides a broken index setup.
  await ensureUserIndexes(db);
  await ensureResetIndexes(db);
  for (const name of [USERS_COLLECTION, PASSWORD_RESETS_COLLECTION, OUTBOX_COLLECTION]) await db.collection(name).deleteMany({});
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("users", () => {
  it("creates a user whose password then checks out, storing only a hash", async () => {
    expect(await createUser(db, "arief@example.com", "secret-123")).toBe(true);
    expect(await checkCredentials(db, "arief@example.com", "secret-123")).toBe(true);
    expect(await checkCredentials(db, "arief@example.com", "wrong-pass")).toBe(false);

    const stored = await db.collection(USERS_COLLECTION).findOne({ email: "arief@example.com" });
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(stored)).not.toContain("secret-123");
  });

  it("refuses a second account for the same email, even when two sign-ups race", async () => {
    const results = await Promise.all([createUser(db, "arief@example.com", "pass-one-1"), createUser(db, "arief@example.com", "pass-two-2")]);
    expect(results.sort()).toEqual([false, true]);
    expect(await db.collection(USERS_COLLECTION).countDocuments()).toBe(1);
  });

  it("checks the password against the right account", async () => {
    await createUser(db, "arief@example.com", "arief-pass-1");
    await createUser(db, "boss@example.com", "boss-pass-12");
    expect(await checkCredentials(db, "boss@example.com", "arief-pass-1")).toBe(false);
    expect(await checkCredentials(db, "boss@example.com", "boss-pass-12")).toBe(true);
  });

  it("says no for an unknown email (and doesn't throw)", async () => {
    expect(await checkCredentials(db, "nobody@example.com", "whatever-1")).toBe(false);
    expect(await userExists(db, "nobody@example.com")).toBe(false);
  });

  it("reports whether a user exists", async () => {
    await createUser(db, "arief@example.com", "secret-123");
    expect(await userExists(db, "arief@example.com")).toBe(true);
    expect(await userExists(db, "boss@example.com")).toBe(false);
  });

  it("passes on database errors other than a duplicate email", async () => {
    const own = await connectMongo(MONGO_URL);
    await own.client.close();
    await expect(createUser(own.db, "arief@example.com", "secret-123")).rejects.toThrow();
  });

  it("changes a password, so only the new one works", async () => {
    await createUser(db, "arief@example.com", "old-pass-1");
    expect(await setPassword(db, "arief@example.com", "new-pass-2")).toBe(true);
    expect(await checkCredentials(db, "arief@example.com", "new-pass-2")).toBe(true);
    expect(await checkCredentials(db, "arief@example.com", "old-pass-1")).toBe(false);
    expect(await setPassword(db, "nobody@example.com", "new-pass-2")).toBe(false);
  });

  it("deletes a user", async () => {
    await createUser(db, "arief@example.com", "secret-123");
    await createUser(db, "boss@example.com", "secret-123");
    expect(await deleteUser(db, "arief@example.com")).toBe(true);
    expect(await deleteUser(db, "arief@example.com")).toBe(false);
    expect(await userExists(db, "boss@example.com")).toBe(true);
  });

  it("enforces unique emails with an index", async () => {
    await db.collection(USERS_COLLECTION).drop().catch(() => undefined);
    await ensureUserIndexes(db);
    const indexes = await db.collection(USERS_COLLECTION).indexes();
    expect(indexes.find((i) => i.key.email === 1)).toMatchObject({ unique: true });
  });
});

describe("password reset tokens", () => {
  it("issues a random token that resolves to the email exactly once", async () => {
    const token = await createResetToken(db, "arief@example.com");
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(await consumeResetToken(db, token)).toBe("arief@example.com");
    expect(await consumeResetToken(db, token)).toBeNull();
  });

  it("can't be used twice even by two requests racing", async () => {
    const token = await createResetToken(db, "arief@example.com");
    const results = await Promise.all([consumeResetToken(db, token), consumeResetToken(db, token)]);
    expect(results.filter(Boolean)).toEqual(["arief@example.com"]);
  });

  it("stores only a hash of the token", async () => {
    const token = await createResetToken(db, "arief@example.com");
    const stored = await db.collection(PASSWORD_RESETS_COLLECTION).findOne({});
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("expires after 30 minutes", async () => {
    const issuedAt = Date.parse("2026-11-18T10:00:00Z");
    const token = await createResetToken(db, "arief@example.com", issuedAt);
    expect(await consumeResetToken(db, token, issuedAt + RESET_TOKEN_TTL_MS)).toBeNull();

    const fresh = await createResetToken(db, "arief@example.com", issuedAt);
    expect(await consumeResetToken(db, fresh, issuedAt + RESET_TOKEN_TTL_MS - 1)).toBe("arief@example.com");
  });

  it.each([undefined, "", 42, "made-up-token"])("rejects %j", async (token) => {
    await createResetToken(db, "arief@example.com");
    expect(await consumeResetToken(db, token)).toBeNull();
  });

  it("has a TTL index so Mongo deletes expired tokens on its own", async () => {
    await db.collection(PASSWORD_RESETS_COLLECTION).drop().catch(() => undefined);
    await ensureResetIndexes(db);
    const indexes = await db.collection(PASSWORD_RESETS_COLLECTION).indexes();
    expect(indexes.find((i) => i.key.expiresAt === 1)).toMatchObject({ expireAfterSeconds: 0 });
    expect(indexes.find((i) => i.key.tokenHash === 1)).toMatchObject({ unique: true });
  });
});

describe("outbox", () => {
  it("stores sent mail and reads it back newest first, filtered by recipient", async () => {
    await sendMail(db, { to: "arief@example.com", subject: "first", text: "1" });
    await sendMail(db, { to: "boss@example.com", subject: "other", text: "x" });
    await sendMail(db, { to: "arief@example.com", subject: "second", text: "2" });

    const mine = await readOutbox(db, "arief@example.com");
    expect(mine.map((m) => m.subject)).toEqual(["second", "first"]);
    expect(mine[0]).toEqual({ to: "arief@example.com", subject: "second", text: "2", createdAt: expect.any(Date) });
    expect((await readOutbox(db)).length).toBe(3);
    expect((await readOutbox(db, undefined, 1)).map((m) => m.subject)).toEqual(["second"]);
  });

  it("breaks ties on the same timestamp by insertion order, newest first", async () => {
    const createdAt = new Date("2026-11-18T10:00:00Z");
    await db.collection(OUTBOX_COLLECTION).insertMany([
      { to: "a@example.com", subject: "older", text: "", createdAt },
      { to: "a@example.com", subject: "newer", text: "", createdAt },
    ]);
    expect((await readOutbox(db)).map((m) => m.subject)).toEqual(["newer", "older"]);
  });
});
