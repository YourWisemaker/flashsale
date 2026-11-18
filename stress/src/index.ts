import { connectMongo, createQueueConnection, createRedisClient, ORDER_QUEUE_NAME } from "@flashsale/core";
import { Queue } from "bullmq";
import { loadStressConfig } from "./config.js";
import { runScenario } from "./run-scenario.js";
import { SCENARIOS } from "./scenarios.js";

async function main() {
  const config = loadStressConfig(process.env);

  const healthCheck = await fetch(`${config.apiUrl}/health`).catch(() => null);
  if (!healthCheck?.ok) {
    console.error(`API at ${config.apiUrl} isn't responding on /health.`);
    console.error("Start it first: pnpm --filter @flashsale/api run dev");
    console.error("...and the worker: pnpm --filter @flashsale/worker run dev");
    process.exit(1);
  }

  const redis = createRedisClient(config.redisUrl);
  const { client: mongoClient, db } = await connectMongo(config.mongoUrl);
  const queueConnection = createQueueConnection(config.redisUrl);
  const queue = new Queue(ORDER_QUEUE_NAME, { connection: queueConnection });

  const results: Array<{ name: string; passed: boolean }> = [];

  for (const scenario of SCENARIOS) {
    const passed = await runScenario(scenario, { apiUrl: config.apiUrl, redis, db, queue, concurrency: config.concurrency });
    results.push({ name: scenario.name, passed });
  }

  console.log("\n=== Summary ===");
  for (const r of results) console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.name}`);

  await queue.close();
  await queueConnection.quit();
  await mongoClient.close();
  await redis.quit();

  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

main().catch((err) => {
  console.error("stress run failed", err);
  process.exit(1);
});
