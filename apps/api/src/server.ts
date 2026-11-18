import cluster from "node:cluster";
import { connectMongo, createQueueConnection, createRedisClient, createSessionTokens, gracefulShutdown, SaleGate } from "@flashsale/core";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MemoryTracker } from "./libs/memory-tracker/index.js";
import { createOrderQueue } from "./queue.js";

const config = loadConfig(process.env);

async function startInstance() {
  // Fail fast while a dependency is down instead of letting requests pile
  // up behind reconnects (ioredis default: 20 retries; Mongo: 30s server
  // selection). API only: the worker keeps the patient defaults so a short
  // blip doesn't push jobs to the DLQ.
  const redis = createRedisClient(config.redisUrl, { maxRetriesPerRequest: 1 });
  const { client: mongo, db } = await connectMongo(config.mongoUrl, { serverSelectionTimeoutMS: 2000 });
  const queueConnection = createQueueConnection(config.redisUrl);
  const queue = createOrderQueue(queueConnection);
  const saleGate = new SaleGate(redis);

  const app = await buildApp({
    saleGate,
    redis,
    db,
    queue,
    rateLimitMax: config.rateLimitMax,
    authRateLimitMax: config.authRateLimitMax,
    sessions: createSessionTokens(config.authSecret),
    webUrl: config.webUrl,
    cookieSecure: config.cookieSecure,
    maxEventLoopLagMs: config.maxEventLoopLagMs,
    memoryTracker: config.memoryTracker ? new MemoryTracker() : undefined,
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });

  // Stop taking new connections, let in-flight requests finish (Fastify
  // answers 503 to anything arriving meanwhile), then close what they used.
  // Order matters: a purchase still running needs Redis and the queue.
  gracefulShutdown(async () => {
    await app.close();
    await queue.close();
    await Promise.all([queueConnection.quit(), redis.quit(), mongo.close()]);
  });
}

/**
 * One Node process uses one CPU core. With API_PROCESSES > 1 this
 * forks that many full API instances sharing the port (the primary
 * hands out connections round robin), the same shape as N containers
 * behind a load balancer. It works because each instance is stateless:
 * every decision lives in Redis.
 *
 * A process that crashes while serving is replaced. A process that dies
 * before it ever started listening (port taken, Redis/Mongo unreachable
 * at boot) is a startup error a replacement would hit too: replacing it
 * would fork-loop and burn every CPU on the box, so the whole cluster
 * exits non-zero instead and lets the supervisor (systemd, k8s) decide.
 */
function startCluster() {
  const serving = new Set<number>();
  let stopping = false;
  cluster.on("listening", (worker) => serving.add(worker.id));
  cluster.on("exit", (worker, code) => {
    if (stopping) return;
    if (!serving.delete(worker.id)) {
      console.error(`api process ${worker.process.pid} failed during startup (${code}), shutting the cluster down`);
      process.exit(1);
    }
    console.error(`api process ${worker.process.pid} exited (${code}), starting a replacement`);
    cluster.fork();
  });
  for (let i = 0; i < config.apiProcesses; i++) cluster.fork();

  // Each child drains itself on SIGTERM; the primary stops replacing them
  // and exits once they're all gone.
  gracefulShutdown(async () => {
    stopping = true;
    const children = Object.values(cluster.workers ?? {}).filter((child) => child !== undefined);
    await Promise.all(
      children.map((child) => new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.process.kill("SIGTERM");
      })),
    );
  });
}

const run = config.apiProcesses > 1 && cluster.isPrimary ? async () => startCluster() : startInstance;

run().catch((err) => {
  console.error("api failed to start", err);
  process.exit(1);
});
