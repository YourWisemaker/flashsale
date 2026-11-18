import { countConfirmedOrders, findProduct, SALE_BUYERS_KEY, SALE_CONFIG_KEY, USERS_COLLECTION } from "@flashsale/core";
import type { Command } from "../command.js";

export const status: Command = {
  name: "status",
  label: "Show status",
  summary: "Sale, product, accounts, buyers, orders and queue at a glance",
  async run(ctx) {
    const [configured, sale, product, buyers, confirmed, jobs, accounts] = await Promise.all([
      ctx.redis.exists(SALE_CONFIG_KEY),
      ctx.gate.getSnapshot(),
      findProduct(ctx.db),
      ctx.redis.scard(SALE_BUYERS_KEY),
      countConfirmedOrders(ctx.db),
      ctx.queue.getJobCounts("waiting", "active", "delayed", "failed"),
      ctx.db.collection(USERS_COLLECTION).countDocuments(),
    ]);

    return [
      configured
        ? `Sale:     ${sale.status}, ${sale.stockLeft} of ${sale.totalStock} left, ${sale.startsAt} to ${sale.endsAt}`
        : "Sale:     not seeded (run: pnpm cli seed)",
      product ? `Product:  ${product.name} (${product.sku})` : "Product:  none (run: pnpm cli product:inject)",
      `Accounts: ${accounts}`,
      `Buyers:   ${buyers} holding a unit, ${confirmed} confirmed in Mongo`,
      `Queue:    ${jobs.waiting} waiting, ${jobs.active} active, ${jobs.delayed} delayed, ${jobs.failed} failed (DLQ)`,
    ];
  },
};
