import { ORDERS_COLLECTION, SALE_BUYERS_KEY, SALE_CONFIG_KEY, SALE_STOCK_KEY, type OrderDocument } from "@flashsale/core";
import { CommandError, type Command } from "../command.js";

/**
 * Every job state except "completed" is a reservation not yet confirmed in
 * Mongo. "failed" matters most: a DLQ job will be replayed and confirm an
 * order, so its user must keep their unit or the unit gets sold twice.
 */
const UNCONFIRMED_JOB_STATES = ["waiting", "active", "delayed", "prioritized", "paused", "waiting-children", "failed"] as const;

/**
 * Rebuilds sale:buyers and sale:stock from durable sources after a Redis
 * loss: confirmed orders in Mongo plus jobs still in the queue. A
 * reservation that reached neither can't be recovered (docs/architecture.md,
 * "Known limits"). Doesn't touch sale:config; if that's gone, re-seed first.
 */
export const reconcile: Command = {
  name: "reconcile",
  label: "Reconcile Redis from Mongo",
  summary: "Rebuild buyers and stock from Mongo + the queue",
  async run(ctx) {
    const totalStock = Number(await ctx.redis.hget(SALE_CONFIG_KEY, "totalStock"));
    if (!totalStock) throw new CommandError("No sale config in Redis. Re-seed with the original window first: pnpm cli seed --force ...");

    const confirmed = await ctx.db.collection<OrderDocument>(ORDERS_COLLECTION).find({ status: "confirmed" }).toArray();
    const queued = await ctx.queue.getJobs([...UNCONFIRMED_JOB_STATES]);
    const buyers = Array.from(new Set([...confirmed.map((o) => o.userId), ...queued.map((j) => j.data.userId)]));
    const stockLeft = Math.max(totalStock - buyers.length, 0);

    const multi = ctx.redis.multi().del(SALE_BUYERS_KEY).set(SALE_STOCK_KEY, stockLeft);
    if (buyers.length > 0) multi.sadd(SALE_BUYERS_KEY, ...buyers);
    await multi.exec();

    return [`Reconciled: ${buyers.length} buyer(s) restored, stock set to ${stockLeft} of ${totalStock}.`];
  },
};
