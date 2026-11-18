import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { fileURLToPath } from "node:url";
import type { OrderJobData, SaleGate, SessionTokens } from "@flashsale/core";
import type { Queue } from "bullmq";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { MongoNetworkError, MongoServerSelectionError, MongoTopologyClosedError, type Db } from "mongodb";
import { createIdempotencyStore } from "./idempotency.js";
import { registerLoadShedding } from "./load-shedding.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerProductRoute } from "./routes/product.js";
import { registerPurchaseRoutes } from "./routes/purchase.js";
import { registerSaleRoute } from "./routes/sale.js";
import { createSessionCookies } from "./session.js";

export interface AppDeps {
  saleGate: SaleGate;
  redis: Redis;
  db: Db;
  queue: Queue<OrderJobData>;
  rateLimitMax: number;
  authRateLimitMax: number;
  sessions: SessionTokens;
  webUrl: string;
  cookieSecure: boolean;
  /** Shed requests with 503 once event loop lag passes this. 0 or unset: off. */
  maxEventLoopLagMs?: number;
  logger?: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? true });
  await app.register(cookie);
  // Stryker disable next-line StringLiteral: declares the property up front for V8 shape stability; behavior is identical without it.
  app.decorateRequest("user", null);
  const cookies = createSessionCookies(deps.sessions, deps.cookieSecure);
  registerLoadShedding(app, { redis: deps.redis, maxEventLoopLagMs: deps.maxEventLoopLagMs ?? 0 });

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
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      status: "rate_limited",
      message: "Too many attempts. Wait a moment and try again.",
    }),
  });

  // Mongo unreachable is an outage, not a bug: answer like Redis being
  // down (503, retry later) instead of 500. Anything else goes to
  // Fastify's default handler unchanged.
  app.setErrorHandler(async (error, _request, reply) => {
    const outage = [MongoServerSelectionError, MongoNetworkError, MongoTopologyClosedError].some((type) => error instanceof type);
    if (outage) {
      return reply.code(503).send({ status: "unavailable" });
    }
    throw error;
  });

  // Anti-clickjacking and basic hardening on every response. This API
  // only ever returns JSON, so nothing should frame it, run scripts from
  // it, or sniff it as another content type.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("x-frame-options", "DENY");
    // Swagger UI (/docs) replaces this with its own CSP in its own hook,
    // which runs after this one (see transformStaticCSP below).
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
  });

  // Hand-written spec (apps/api/openapi.yaml), served at /docs. Static
  // mode leaves the routes' serialization alone; a test checks every
  // route is in the spec. Same path from src/ and dist/.
  await app.register(swagger, {
    mode: "static",
    // Stryker disable next-line StringLiteral: baseDir only resolves external $refs, and the spec has none.
    specification: { path: fileURLToPath(new URL("../openapi.yaml", import.meta.url)), baseDir: "" },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
    // Its default allows framing by itself and blocks the inline styles
    // the UI sets. Scripts stay 'self' only.
    transformStaticCSP: (header) =>
      header.replace("frame-ancestors 'self'", "frame-ancestors 'none'").replace("style-src 'self' https:", "style-src 'self' 'unsafe-inline'"),
  });

  registerSaleRoute(app, deps);
  registerProductRoute(app, deps);
  registerAuthRoutes(app, { ...deps, cookies });
  registerPurchaseRoutes(app, { ...deps, cookies, idempotency: createIdempotencyStore(deps.redis) });
  registerHealthRoute(app, deps);

  return app;
}
