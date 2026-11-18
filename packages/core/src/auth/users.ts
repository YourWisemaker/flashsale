import type { Db } from "mongodb";
import { normalizeUserId } from "../user-id.js";
import { hashPassword, verifyPassword } from "./password.js";

export const USERS_COLLECTION = "users";

export interface UserDocument {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/**
 * A user's email is also their purchase identity (the brief's "user
 * identifier"), so it goes through the same normalization as every other
 * userId, plus an email shape check.
 */
export function normalizeEmail(raw: unknown): string | null {
  const id = normalizeUserId(raw);
  return id && /^[^@]+@[^@]+\.[^@]+$/.test(id) ? id : null;
}

export async function ensureUserIndexes(db: Db): Promise<void> {
  await db.collection<UserDocument>(USERS_COLLECTION).createIndex({ email: 1 }, { unique: true });
}

/** False when the email is already registered (the unique index decides, so two racing sign-ups can't both win). */
export async function createUser(db: Db, email: string, password: string): Promise<boolean> {
  try {
    await db.collection<UserDocument>(USERS_COLLECTION).insertOne({ email, passwordHash: await hashPassword(password), createdAt: new Date() });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

// Verified against when the email doesn't exist, so "no such user" and
// "wrong password" take the same time and can't be told apart.
// Stryker disable next-line StringLiteral: any value no password hashes to behaves the same; this one also costs a full scrypt run, which is the point.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

export async function checkCredentials(db: Db, email: string, password: string): Promise<boolean> {
  const user = await db.collection<UserDocument>(USERS_COLLECTION).findOne({ email });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  // Stryker disable next-line ConditionalExpression: equivalent today (no password hashes to DUMMY_HASH); kept so a missing user can never pass.
  return ok && user !== null;
}

export async function userExists(db: Db, email: string): Promise<boolean> {
  // Stryker disable next-line ObjectLiteral: { limit: 1 } is a speed hint; the unique index already caps the count at 1.
  return (await db.collection<UserDocument>(USERS_COLLECTION).countDocuments({ email }, { limit: 1 })) === 1;
}

/** Sets a new password; true if the user exists. */
export async function setPassword(db: Db, email: string, password: string): Promise<boolean> {
  const { matchedCount } = await db.collection<UserDocument>(USERS_COLLECTION).updateOne({ email }, { $set: { passwordHash: await hashPassword(password) } });
  return matchedCount === 1;
}

export async function deleteUser(db: Db, email: string): Promise<boolean> {
  const { deletedCount } = await db.collection<UserDocument>(USERS_COLLECTION).deleteOne({ email });
  return deletedCount === 1;
}
