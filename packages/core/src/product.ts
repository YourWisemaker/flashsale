import type { Db } from "mongodb";

/**
 * What's being sold. Display data only: stock, the sale window and who
 * bought live in Redis (SaleGate). Nothing here is read on the purchase
 * path, so it can be cached freely.
 */
export interface ProductDocument {
  sku: string;
  name: string;
  description: string;
  /** Prices in minor units (cents), to avoid float rounding. */
  priceCents: number;
  originalPriceCents: number;
  currency: string;
  images: { url: string; alt: string }[];
  specs: { label: string; value: string }[];
}

export const PRODUCTS_COLLECTION = "products";

/**
 * The brief sells one product, so there's one document. Replacing
 * "whatever is there" in one atomic call means a re-seed never leaves a
 * moment where readers see no product, even if the sku changes.
 */
export async function saveProduct(db: Db, product: ProductDocument): Promise<void> {
  await db.collection<ProductDocument>(PRODUCTS_COLLECTION).replaceOne({}, product, { upsert: true });
}

export async function findProduct(db: Db): Promise<ProductDocument | null> {
  return db.collection<ProductDocument>(PRODUCTS_COLLECTION).findOne({}, { projection: { _id: 0 } });
}
