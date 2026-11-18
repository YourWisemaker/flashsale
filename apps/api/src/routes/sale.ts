import type { SaleGate } from "@flashsale/core";
import type { FastifyInstance } from "fastify";

export function registerSaleRoute(app: FastifyInstance, deps: { saleGate: SaleGate }): void {
  app.get("/api/sale", async (_request, reply) => {
    // A CDN may serve this for 1s (s-maxage), so N polling browsers cost
    // Redis one read per second per edge. Browsers always refetch
    // (max-age=0), so a buyer never sees their own tab's stale stock.
    return reply.header("cache-control", "public, max-age=0, s-maxage=1").send(await deps.saleGate.getSnapshot());
  });
}
