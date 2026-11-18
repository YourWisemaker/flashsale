import { findProduct } from "@flashsale/core";
import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";

export function registerProductRoute(app: FastifyInstance, deps: { db: Db }): void {
  app.get("/api/product", async (_request, reply) => {
    const product = await findProduct(deps.db);
    if (!product) return reply.code(404).send({ error: "not_found", message: "No product seeded. Run pnpm seed." });

    // Display data that only changes on re-seed. A CDN or the browser can
    // absorb the page-load spike instead of every visitor hitting Mongo.
    return reply.header("cache-control", "public, max-age=60").send(product);
  });
}
