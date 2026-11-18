import rateLimit from "@fastify/rate-limit";
import type { OrderJobData, SaleGate } from "@flashsale/core";
import type { Queue } from "bullmq";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Db } from "mongodb";
import { registerHealthRoute } from "./routes/health.js";
import { registerPurchaseRoutes } from "./routes/purchase.js";
import { registerSaleRoute } from "./routes/sale.js";

export interface AppDeps {
  saleGate: SaleGate;
  redis: Redis;
  db: Db;
  queue: Queue<OrderJobData>;
  rateLimitMax: number;
  logger?: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? true });

  // Keyed by IP, backed by Redis so the limit holds across API
  // instances, not just inside one process. Not global: only the
  // purchase route opts in (see routes/purchase.ts), so the frontend's
  // status polling never spends a user's purchase budget.
  await app.register(rateLimit, {
    global: false,
    max: deps.rateLimitMax,
    timeWindow: "1 second",
    redis: deps.redis,
    // The plugin throws whatever this returns; without statusCode,
    // Fastify treats it as an unknown error and answers 500.
    errorResponseBuilder: (_request, context) => ({ statusCode: context.statusCode, status: "rate_limited" }),
  });

  registerSaleRoute(app, deps);
  registerPurchaseRoutes(app, deps);
  registerHealthRoute(app, deps);

  return app;
}
