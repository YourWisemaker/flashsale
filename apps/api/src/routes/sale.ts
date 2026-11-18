import type { SaleGate } from "@flashsale/core";
import type { FastifyInstance } from "fastify";

export function registerSaleRoute(app: FastifyInstance, deps: { saleGate: SaleGate }): void {
  app.get("/api/sale", async () => {
    return deps.saleGate.getSnapshot();
  });
}
