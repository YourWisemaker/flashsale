import type { Queue } from "bullmq";

/** Polls until the real worker (running separately) has processed every reservation. */
export async function waitForQueueDrain(queue: Queue, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const counts = await queue.getJobCounts("wait", "active", "delayed");
    if (counts.wait + counts.active + counts.delayed === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Queue did not drain within ${timeoutMs}ms. Is the worker (pnpm --filter @flashsale/worker run dev) running?`);
}
