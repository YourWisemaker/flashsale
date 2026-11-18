import { ORDERS_COLLECTION, SALE_STOCK_KEY, type OrderDocument } from "@flashsale/core";
import type { Db } from "mongodb";
import type { Redis } from "ioredis";

export interface InvariantCheck {
  name: string;
  pass: boolean;
  detail: string;
}

/**
 * The actual proof the stress run is meant to produce: not "it didn't
 * crash", but "the numbers are exactly right" after everything settles.
 */
export async function checkInvariants(
  db: Db,
  redis: Redis,
  expected: { totalStock: number; uniqueUsers: number },
): Promise<InvariantCheck[]> {
  const confirmedOrders = await db.collection<OrderDocument>(ORDERS_COLLECTION).find({ status: "confirmed" }).toArray();
  const confirmedUserIds = confirmedOrders.map((o) => o.userId);
  const expectedWinners = Math.min(expected.totalStock, expected.uniqueUsers);
  const stockLeft = Number((await redis.get(SALE_STOCK_KEY)) ?? -1);

  const checks: InvariantCheck[] = [];

  checks.push({
    name: "no overselling",
    pass: confirmedOrders.length === expectedWinners,
    detail: `confirmed orders = ${confirmedOrders.length}, expected min(stock, unique users) = ${expectedWinners}`,
  });

  checks.push({
    name: "no duplicate winners",
    pass: new Set(confirmedUserIds).size === confirmedUserIds.length,
    detail: `${confirmedUserIds.length} confirmed orders, ${new Set(confirmedUserIds).size} distinct userIds`,
  });

  checks.push({
    name: "stock never negative",
    pass: stockLeft >= 0,
    detail: `sale:stock = ${stockLeft}`,
  });

  checks.push({
    name: "redis stock matches mongo confirmations",
    pass: stockLeft === expected.totalStock - confirmedOrders.length,
    detail: `sale:stock = ${stockLeft}, totalStock - confirmed = ${expected.totalStock - confirmedOrders.length}`,
  });

  return checks;
}

export function printInvariants(checks: InvariantCheck[]): boolean {
  let allPassed = true;
  for (const check of checks) {
    console.log(`  [${check.pass ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`);
    if (!check.pass) allPassed = false;
  }
  return allPassed;
}
