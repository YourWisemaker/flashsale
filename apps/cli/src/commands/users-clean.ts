import { ORDERS_COLLECTION, SALE_BUYERS_KEY, SALE_CONFIG_KEY, SALE_STOCK_KEY } from "@flashsale/core";
import type { Command } from "../command.js";

export const usersClean: Command = {
  name: "users:clean",
  label: "Clean up all user data",
  summary: "Delete every order, buyer and queued job; stock back to full",
  destructive: true,
  async run(ctx) {
    const buyers = await ctx.redis.scard(SALE_BUYERS_KEY);
    const { deletedCount } = await ctx.db.collection(ORDERS_COLLECTION).deleteMany({});
    await ctx.queue.obliterate({ force: true });

    const totalStock = await ctx.redis.hget(SALE_CONFIG_KEY, "totalStock");
    const multi = ctx.redis.multi().del(SALE_BUYERS_KEY);
    if (totalStock !== null) multi.set(SALE_STOCK_KEY, totalStock);
    await multi.exec();

    return [
      `Removed ${buyers} buyer(s), ${deletedCount} order(s), and every queued and failed job.`,
      totalStock !== null ? `Stock reset to ${totalStock}. Product and sale window kept.` : "No sale seeded, so no stock to reset.",
    ];
  },
};
