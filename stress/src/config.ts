export function loadStressConfig(env: NodeJS.ProcessEnv) {
  return {
    apiUrl: env.STRESS_API_URL ?? "http://localhost:3000",
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    mongoUrl: env.MONGO_URL ?? "mongodb://localhost:27017/flashsale",
    concurrency: Number(env.STRESS_CONCURRENCY ?? 300),
    // Must match the API's, so the minted session cookies verify.
    authSecret: env.AUTH_SECRET ?? "dev-only-secret-do-not-use-in-production",
  };
}
