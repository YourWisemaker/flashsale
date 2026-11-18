import {
  ORDERS_COLLECTION,
  OUTBOX_COLLECTION,
  PASSWORD_RESETS_COLLECTION,
  PRODUCTS_COLLECTION,
  SALE_BUYERS_KEY,
  SALE_CONFIG_KEY,
  SALE_STOCK_KEY,
  USERS_COLLECTION,
} from "@flashsale/core";
import type { Command } from "../command.js";

export const reset: Command = {
  name: "reset",
  label: "Clean up all data",
  summary: "Delete everything: sale, buyers, queue, orders, product, accounts, emails",
  destructive: true,
  async run(ctx) {
    await ctx.redis.del(SALE_CONFIG_KEY, SALE_STOCK_KEY, SALE_BUYERS_KEY);
    await ctx.queue.obliterate({ force: true });
    const orders = await ctx.db.collection(ORDERS_COLLECTION).deleteMany({});
    const products = await ctx.db.collection(PRODUCTS_COLLECTION).deleteMany({});
    const users = await ctx.db.collection(USERS_COLLECTION).deleteMany({});
    await ctx.db.collection(PASSWORD_RESETS_COLLECTION).deleteMany({});
    await ctx.db.collection(OUTBOX_COLLECTION).deleteMany({});
    return [
      `Deleted the sale, ${orders.deletedCount} order(s), ${products.deletedCount} product(s), ${users.deletedCount} account(s), reset links, the outbox, and the queue.`,
      "Indexes kept. Run pnpm cli seed to start again.",
    ];
  },
};
