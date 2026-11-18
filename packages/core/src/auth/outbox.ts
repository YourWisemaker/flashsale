import type { Db } from "mongodb";

export const OUTBOX_COLLECTION = "outbox";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  createdAt: Date;
}

/**
 * Stand-in for an email provider (the brief allows mocking cloud
 * services). "Sending" stores the message; `pnpm cli outbox` and the e2e
 * tests read it. Swapping in SES or SendGrid replaces this one function.
 */
export async function sendMail(db: Db, mail: Omit<Mail, "createdAt">): Promise<void> {
  await db.collection<Mail>(OUTBOX_COLLECTION).insertOne({ ...mail, createdAt: new Date() });
}

/** Newest first, without Mongo's _id. */
export async function readOutbox(db: Db, to?: string, limit = 10): Promise<Mail[]> {
  return db
    .collection<Mail>(OUTBOX_COLLECTION)
    .find(to ? { to } : {}, { projection: { _id: 0 } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
}
