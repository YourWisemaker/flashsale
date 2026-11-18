import { monitorEventLoopDelay } from "node:perf_hooks";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

const SAMPLE_MS = 10;

/** Pure so it can be tested without a real overload. 0 turns shedding off. */
export function isOverloaded(lagMs: number, maxLagMs: number): boolean {
  return maxLagMs > 0 && lagMs > maxLagMs;
}

/** Display data cached in memory and in Mongo: the shop page still renders with Redis down. */
const WORKS_WITHOUT_REDIS = "/api/product";

/**
 * Two cheap ways to say no fast instead of queueing work that will time out:
 *
 * 1. Redis connection not ready: 503 before any Redis call (session
 *    checks, the rate limiter and the purchase gate all need it). This is
 *    a breaker on ioredis's own connection state, not a breaker library:
 *    it opens the moment the socket drops and closes the moment it's back.
 * 2. Event loop lagging past maxLagMs: this process is saturated, so
 *    shed with 503 + retry-after rather than make every request slow.
 *
 * Both answer before the purchase gate runs, so a shed request never
 * holds a unit. /health gets shed too, on purpose: a load balancer then
 * stops sending traffic to the saturated instance. Registered as an app-level hook, which Fastify runs
 * before route-level hooks such as the rate limiter.
 */
export function registerLoadShedding(app: FastifyInstance, deps: { redis: Redis; maxEventLoopLagMs: number }): void {
  // Stryker disable next-line ObjectLiteral: 10ms is also Node's default resolution.
  const histogram = monitorEventLoopDelay({ resolution: SAMPLE_MS });
  histogram.enable();
  let lagMs = 0;
  const timer = setInterval(() => {
    // The histogram counts the sampling interval itself as delay; take it off.
    lagMs = Math.max(0, histogram.mean / 1e6 - SAMPLE_MS);
    histogram.reset();
  }, 500).unref();

  // Stryker disable next-line BlockStatement: cleanup only; the timer is unref'd, so a leak can't hold the process open or change a response.
  app.addHook("onClose", async () => {
    clearInterval(timer);
    histogram.disable();
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === WORKS_WITHOUT_REDIS) return;
    if (deps.redis.status !== "ready") return reply.code(503).send({ status: "unavailable" });
    if (isOverloaded(lagMs, deps.maxEventLoopLagMs)) {
      return reply.code(503).header("retry-after", "1").send({ status: "unavailable" });
    }
  });
}
