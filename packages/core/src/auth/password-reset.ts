import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";

export const PASSWORD_RESETS_COLLECTION = "password_resets";
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

interface ResetDocument {
  tokenHash: string;
  email: string;
  expiresAt: Date;
}

/** Only the hash is stored, so a leaked database can't be used to reset anyone's password. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function ensureResetIndexes(db: Db): Promise<void> {
  const resets = db.collection<ResetDocument>(PASSWORD_RESETS_COLLECTION);
  await resets.createIndex({ tokenHash: 1 }, { unique: true });
  // Mongo deletes expired tokens on its own.
  await resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

/** Issues a single-use token and returns it in clear, for the email only. */
export async function createResetToken(db: Db, email: string, now: number = Date.now()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.collection<ResetDocument>(PASSWORD_RESETS_COLLECTION).insertOne({ tokenHash: hashToken(token), email, expiresAt: new Date(now + RESET_TOKEN_TTL_MS) });
  return token;
}

/**
 * The email the token belongs to, or null if it's unknown, used, or
 * expired. Atomic find-and-delete, so the same token can't be used twice
 * even by two requests racing.
 */
export async function consumeResetToken(db: Db, token: unknown, now: number = Date.now()): Promise<string | null> {
  if (typeof token !== "string") return null;
  const doc = await db.collection<ResetDocument>(PASSWORD_RESETS_COLLECTION).findOneAndDelete({ tokenHash: hashToken(token), expiresAt: { $gt: new Date(now) } });
  return doc?.email ?? null;
}
