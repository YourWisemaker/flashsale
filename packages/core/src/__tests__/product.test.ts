import type { Db, MongoClient } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectMongo } from "../mongo.js";
import { findProduct, PRODUCTS_COLLECTION, saveProduct, type ProductDocument } from "../product.js";

let client: MongoClient;
let db: Db;

const product = (overrides: Partial<ProductDocument> = {}): ProductDocument => ({
  sku: "HT-001",
  name: "Hi-Top",
  description: "A sneaker.",
  priceCents: 8900,
  originalPriceCents: 14900,
  currency: "USD",
  images: [{ url: "/products/a.jpg", alt: "side view" }],
  specs: [{ label: "Upper", value: "Suede" }],
  ...overrides,
});

beforeAll(async () => {
  ({ client, db } = await connectMongo(`${process.env.TEST_MONGO_URL ?? "mongodb://localhost:27017"}/flashsale_test_core_product`));
});

beforeEach(async () => {
  await db.collection(PRODUCTS_COLLECTION).deleteMany({});
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("product", () => {
  it("returns null before anything is seeded", async () => {
    expect(await findProduct(db)).toBeNull();
  });

  it("returns the saved product without Mongo's _id", async () => {
    await saveProduct(db, product());
    expect(await findProduct(db)).toEqual(product());
  });

  it("re-seeding the same sku replaces it instead of adding a second one", async () => {
    await saveProduct(db, product());
    await saveProduct(db, product({ name: "Renamed" }));

    expect(await db.collection(PRODUCTS_COLLECTION).countDocuments()).toBe(1);
    expect((await findProduct(db))?.name).toBe("Renamed");
  });

  it("seeding a different sku leaves exactly that one product (the brief sells one)", async () => {
    await saveProduct(db, product());
    await saveProduct(db, product({ sku: "HT-002" }));

    expect(await db.collection(PRODUCTS_COLLECTION).countDocuments()).toBe(1);
    expect((await findProduct(db))?.sku).toBe("HT-002");
  });
});
