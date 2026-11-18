import { findProduct, type ProductDocument } from "@flashsale/core";
import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";

const CACHE_MS = 60_000;

export function registerProductRoute(app: FastifyInstance, deps: { db: Db; now?: () => number }): void {
  const now = deps.now ?? Date.now;
  // ponytail: per-process cache, so a re-seed shows up within 60s on every
  // instance. Same window as the cache-control header below.
  let cached: { product: ProductDocument; expiresAt: number } | null = null;

  app.get("/api/product", async (_request, reply) => {
    if (!cached || now() >= cached.expiresAt) {
      const product = await findProduct(deps.db);
      // Never cache "not found": seeding must show up on the next request.
      if (!product) return reply.code(404).send({ error: "not_found", message: "No product seeded. Run pnpm seed." });
      cached = { product, expiresAt: now() + CACHE_MS };
    }

    // Display data that only changes on re-seed. A CDN or the browser can
    // absorb the page-load spike, and this process answers the rest from
    // memory instead of every visitor hitting Mongo.
    return reply.header("cache-control", "public, max-age=60").send(cached.product);
  });
}
