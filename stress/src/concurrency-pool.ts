/**
 * The whole load generator, really: a fixed number of workers pull the
 * next task off a shared queue until it's empty. No dependency pulls
 * this in for free (autocannon's per-request body hooks don't give
 * the per-request control this needs), and it's short enough not to
 * need one.
 */
export async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}
