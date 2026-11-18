import type { Command } from "../command.js";

/**
 * BullMQ's failed set is the DLQ: jobs that used up their 5 attempts.
 * Replay once whatever failed them (usually Mongo) is back. confirmOrder
 * is an upsert, so replaying a job that partly succeeded is harmless.
 */
export const dlqReplay: Command = {
  name: "dlq:replay",
  label: "Replay failed jobs (DLQ)",
  summary: "Move every failed job back onto the queue",
  async run(ctx) {
    const failed = await ctx.queue.getFailed(0, -1);
    for (const job of failed) await job.retry("failed");
    return [failed.length ? `Requeued ${failed.length} failed job(s).` : "DLQ is empty, nothing to replay."];
  },
};
