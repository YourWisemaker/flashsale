import type { Db } from "mongodb";

export const ORDERS_COLLECTION = "orders";

export interface OrderDocument {
  userId: string;
  status: "confirmed";
  createdAt: Date;
}

export interface OrderJobData {
  userId: string;
  reservedAt: string;
}

/** Unique index is what makes a replayed or duplicate job harmless. */
export async function ensureOrderIndexes(db: Db): Promise<void> {
  await db.collection<OrderDocument>(ORDERS_COLLECTION).createIndex({ userId: 1 }, { unique: true });
}

/**
 * Upsert, not insert: the worker (or a replayed DLQ job) can run this
 * twice for the same user and the second call changes nothing, instead
 * of throwing a duplicate-key error that would need its own handling.
 */
export async function confirmOrder(db: Db, userId: string): Promise<void> {
  await db
    .collection<OrderDocument>(ORDERS_COLLECTION)
    .updateOne({ userId }, { $setOnInsert: { userId, status: "confirmed", createdAt: new Date() } }, { upsert: true });
}

export async function findOrder(db: Db, userId: string): Promise<OrderDocument | null> {
  return db.collection<OrderDocument>(ORDERS_COLLECTION).findOne({ userId });
}

export async function countConfirmedOrders(db: Db): Promise<number> {
  return db.collection<OrderDocument>(ORDERS_COLLECTION).countDocuments({ status: "confirmed" });
}
