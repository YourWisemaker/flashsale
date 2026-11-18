import cluster from "node:cluster";
import { connectMongo, createQueueConnection, createRedisClient, SaleGate } from "@flashsale/core";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createOrderQueue } from "./queue.js";

const config = loadConfig(process.env);

async function startInstance() {
  const redis = createRedisClient(config.redisUrl);
  const { db } = await connectMongo(config.mongoUrl);
  const queue = createOrderQueue(createQueueConnection(config.redisUrl));
  const saleGate = new SaleGate(redis);

  const app = await buildApp({ saleGate, redis, db, queue, rateLimitMax: config.rateLimitMax });

  await app.listen({ port: config.port, host: "0.0.0.0" });
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
  cluster.on("listening", (worker) => serving.add(worker.id));
  cluster.on("exit", (worker, code) => {
    if (!serving.delete(worker.id)) {
      console.error(`api process ${worker.process.pid} failed during startup (${code}), shutting the cluster down`);
      process.exit(1);
    }
    console.error(`api process ${worker.process.pid} exited (${code}), starting a replacement`);
    cluster.fork();
  });
  for (let i = 0; i < config.apiProcesses; i++) cluster.fork();
}

const run = config.apiProcesses > 1 && cluster.isPrimary ? async () => startCluster() : startInstance;

run().catch((err) => {
  console.error("api failed to start", err);
  process.exit(1);
});
