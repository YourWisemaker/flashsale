export interface WorkerConfig {
  redisUrl: string;
  mongoUrl: string;
  concurrency: number;
}

/** Pure, no I/O: reads from a plain object so tests can pass a fake env. */
export function loadConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  return {
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    mongoUrl: env.MONGO_URL ?? "mongodb://localhost:27017/flashsale",
    concurrency: Number(env.WORKER_CONCURRENCY ?? 10),
  };
}
