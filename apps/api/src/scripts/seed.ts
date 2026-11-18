import { connectMongo, createRedisClient, ensureOrderIndexes, saveProduct, SaleGate } from "@flashsale/core";
import { loadConfig } from "../config.js";
import { SEED_PRODUCT } from "../seed/product.js";

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

async function main() {
  const force = process.argv.includes("--force");
  const config = loadConfig(process.env);
  const redis = createRedisClient(config.redisUrl);
  const saleGate = new SaleGate(redis);
  const { client, db } = await connectMongo(config.mongoUrl);

  // Indexes and product display data are idempotent, so they're written
  // every time. Only the sale window and stock are guarded.
  await ensureOrderIndexes(db);
  await saveProduct(db, SEED_PRODUCT);
  console.log(`Product seeded: ${SEED_PRODUCT.name} (${SEED_PRODUCT.images.length} images)`);

  const existing = await saleGate.getSnapshot();
  const alreadySeeded = existing.totalStock > 0;

  if (alreadySeeded && !force) {
    console.error(`Sale already seeded (status: ${existing.status}, stock left: ${existing.stockLeft}).`);
    console.error("Pass --force to overwrite it.");
    await client.close();
    await redis.quit();
    process.exit(1);
  }

  const startsAt = process.env.SALE_START ? new Date(process.env.SALE_START) : new Date(Date.now() + ONE_MINUTE_MS);
  const endsAt = process.env.SALE_END ? new Date(process.env.SALE_END) : new Date(startsAt.getTime() + ONE_HOUR_MS);
  const totalStock = config.defaultStockIfUnset;

  await saleGate.configure({ startsAt, endsAt, totalStock });

  console.log("Sale seeded:");
  console.log(`  starts: ${startsAt.toISOString()}`);
  console.log(`  ends:   ${endsAt.toISOString()}`);
  console.log(`  stock:  ${totalStock}`);

  await client.close();
  await redis.quit();
}

main().catch((err) => {
  console.error("seed failed", err);
  process.exit(1);
});
