export interface AppConfig {
  port: number;
  redisUrl: string;
  mongoUrl: string;
  rateLimitMax: number;
  /** Processes to run on this host. Each is a full, stateless API instance. */
  apiProcesses: number;
  // Window defaults applied by the seed script, not the server itself.
  defaultStockIfUnset: number;
}

/** Pure, no I/O: reads from a plain object so tests can pass a fake env. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    mongoUrl: env.MONGO_URL ?? "mongodb://localhost:27017/flashsale",
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 5),
    apiProcesses: Math.max(1, Number(env.API_PROCESSES ?? 1)),
    defaultStockIfUnset: Number(env.SALE_STOCK ?? 100),
  };
}
