import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { connectMongo } from "../mongo.js";
import { confirmOrder, countConfirmedOrders, ensureOrderIndexes, findOrder, ORDERS_COLLECTION } from "../orders.js";

// Real Mongo, its own database so it can't clash with the app suites.
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  ({ client, db } = await connectMongo(`${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test_core`));
});

beforeEach(async () => {
  await db.collection(ORDERS_COLLECTION).drop().catch(() => undefined);
  await ensureOrderIndexes(db);
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("orders", () => {
  it("confirms an order for a user", async () => {
    await confirmOrder(db, "arief");

    const order = await findOrder(db, "arief");
    expect(order).toMatchObject({ userId: "arief", status: "confirmed" });
    expect(order?.createdAt).toBeInstanceOf(Date);
  });

  it("is idempotent: confirming twice keeps one order and the original timestamp", async () => {
    await confirmOrder(db, "arief");
    const first = await findOrder(db, "arief");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await confirmOrder(db, "arief");

    expect(await db.collection(ORDERS_COLLECTION).countDocuments({ userId: "arief" })).toBe(1);
    expect((await findOrder(db, "arief"))?.createdAt).toEqual(first?.createdAt);
  });

  it("finds only the requested user's order", async () => {
    await confirmOrder(db, "arief");
    await confirmOrder(db, "boss");

    expect((await findOrder(db, "boss"))?.userId).toBe("boss");
    expect(await findOrder(db, "nobody")).toBeNull();
  });

  it("counts only confirmed orders", async () => {
    await confirmOrder(db, "arief");
    await confirmOrder(db, "boss");
    await db.collection(ORDERS_COLLECTION).insertOne({ userId: "draft", status: "pending" });

    expect(await countConfirmedOrders(db)).toBe(2);
  });

  it("has a unique index on userId, so a second raw insert for the same user fails", async () => {
    await confirmOrder(db, "arief");

    await expect(db.collection(ORDERS_COLLECTION).insertOne({ userId: "arief", status: "confirmed" })).rejects.toThrow(/duplicate key/);
  });
});
