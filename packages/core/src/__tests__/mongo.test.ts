import { describe, expect, it } from "vitest";
import { connectMongo } from "../mongo.js";

// Own file with no beforeAll on purpose: when a setup hook throws,
// Vitest skips that file's tests instead of failing them, so a broken
// connectMongo inside orders.test.ts's beforeAll would go unnoticed.
describe("connectMongo", () => {
  it("connects and uses the database named in the connection URL", async () => {
    const { client, db } = await connectMongo(`${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test_core_conn`);
    expect(db.databaseName).toBe("flashsale_test_core_conn");
    expect(await db.command({ ping: 1 })).toMatchObject({ ok: 1 });
    await client.close();
  });
});
