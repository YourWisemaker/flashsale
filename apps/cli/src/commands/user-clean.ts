import { normalizeUserId, ORDERS_COLLECTION, orderJobId } from "@flashsale/core";
import { CommandError, type Command } from "../command.js";

export const userClean: Command = {
  name: "user:clean",
  label: "Clean up specific user data",
  syntax: "<userId>",
  summary: "Free one user's unit, delete their order and queued job",
  destructive: true,
  needs: [{ name: "userId", prompt: "User id to clean up: " }],
  async run(ctx, args) {
    const userId = normalizeUserId(args.positionals[0]);
    if (!userId) throw new CommandError("Give a valid user id, e.g. pnpm cli user:clean arief@example.com");

    // release.lua: removes them from the buyer set and gives the unit back
    // in one atomic step, so stock and buyers can't drift apart.
    const released = await ctx.gate.release(userId);
    const { deletedCount } = await ctx.db.collection(ORDERS_COLLECTION).deleteOne({ userId });
    const jobRemoved = await removeJob(ctx.queue, orderJobId(userId));

    if (!released && !deletedCount && jobRemoved === "none") return [`Nothing to clean up for ${userId}.`];
    return [
      `Cleaned up ${userId}:`,
      `  unit returned to stock: ${released ? "yes" : "no (they didn't hold one)"}`,
      `  order deleted: ${deletedCount ? "yes" : "no (none confirmed)"}`,
      `  queued job: ${jobRemoved === "removed" ? "removed" : jobRemoved === "busy" ? "being processed right now, will confirm an order; run this again" : "none"}`,
    ];
  },
};

async function removeJob(queue: import("bullmq").Queue, jobId: string): Promise<"removed" | "busy" | "none"> {
  const job = await queue.getJob(jobId);
  if (!job) return "none";
  try {
    await job.remove();
    return "removed";
  } catch {
    // A worker holds the lock on an active job; BullMQ won't remove it.
    return "busy";
  }
}
