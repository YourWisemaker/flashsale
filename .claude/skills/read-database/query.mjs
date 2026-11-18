// Read-only Mongo query helper: count + find, nothing else.
// node .claude/skills/read-database/query.mjs <collection> [filterJson] [limit]
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../packages/core/package.json", import.meta.url));
const { MongoClient } = require("mongodb");

const [collection, filterJson = "{}", limit = "5"] = process.argv.slice(2);
if (!collection) {
  console.error("usage: query.mjs <collection> [filterJson] [limit]");
  process.exit(1);
}

const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/flashsale";
const client = new MongoClient(url, { serverSelectionTimeoutMS: 3000 });
try {
  const col = client.db().collection(collection);
  const filter = JSON.parse(filterJson);
  // Never print password hashes or reset token hashes.
  const projection = { passwordHash: 0, tokenHash: 0 };
  console.log(`${url} ${collection} count:`, await col.countDocuments(filter));
  console.log(JSON.stringify(await col.find(filter, { projection }).limit(Number(limit)).toArray(), null, 2));
} finally {
  await client.close();
}
