import { ORDERS_COLLECTION, SaleGate, type SessionTokens } from "@flashsale/core";
import type { Queue } from "bullmq";
import type { Db } from "mongodb";
import type { Redis } from "ioredis";
import { waitForQueueDrain } from "./drain.js";
import { runWithConcurrency } from "./concurrency-pool.js";
import { attemptPurchase } from "./http.js";
import { checkInvariants, printInvariants } from "./invariants.js";
import { buildReport, printReport } from "./report.js";
import type { Scenario } from "./scenarios.js";

export async function runScenario(
  scenario: Scenario,
  deps: { apiUrl: string; redis: Redis; db: Db; queue: Queue; concurrency: number; sessions: SessionTokens },
): Promise<boolean> {
  console.log(`\n=== ${scenario.name} ===`);

  await deps.db.collection(ORDERS_COLLECTION).deleteMany({});
  await new SaleGate(deps.redis).configure({
    startsAt: new Date(Date.now() - 1000),
    endsAt: new Date(Date.now() + 10 * 60_000),
    totalStock: scenario.totalStock,
  });

  const userIds = scenario.buildUserIds();
  const tokens = new Map([...new Set(userIds)].map((userId) => [userId, deps.sessions.sign(userId)]));
  const tasks = userIds.map((userId) => () => attemptPurchase(deps.apiUrl, userId, tokens.get(userId)!));

  const startedAt = performance.now();
  const results = await runWithConcurrency(tasks, deps.concurrency);
  const durationMs = Math.round(performance.now() - startedAt);

  printReport(scenario.name, buildReport(results, durationMs));

  console.log("waiting for the queue to drain...");
  await waitForQueueDrain(deps.queue);

  console.log("invariants:");
  const checks = await checkInvariants(deps.db, deps.redis, {
    totalStock: scenario.totalStock,
    uniqueUsers: scenario.uniqueUsers,
  });
  return printInvariants(checks);
}
