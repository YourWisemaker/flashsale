export interface AppConfig {
  port: number;
  redisUrl: string;
  mongoUrl: string;
  rateLimitMax: number;
  /** Login, sign-up, forgot and reset attempts per IP per minute (brute-force guard). */
  authRateLimitMax: number;
  /** Processes to run on this host. Each is a full, stateless API instance. */
  apiProcesses: number;
  /** Signs session cookies. Anyone holding it can log in as anyone. */
  authSecret: string;
  /** Public web URL, for links in emails (password reset). */
  webUrl: string;
  /** Session cookie only over HTTPS. On whenever NODE_ENV=production. */
  cookieSecure: boolean;
  /** Event loop lag (ms) past which this process sheds requests with 503. 0 turns it off. */
  maxEventLoopLagMs: number;
  /** Debug aid, off by default: counts live request objects per route, serves GET /debug/memory. */
  memoryTracker: boolean;
  /** Debug aid, off by default: saves a CPU profile whenever the event loop stalls past thresholdMs. */
  freezeProfiler: { enabled: boolean; thresholdMs: number; dir: string; s3Bucket: string | null };
  /** Lets the freeze profiler ask Claude to explain a capture. Unset: no explanation, no network call. */
  anthropicApiKey: string | null;
}

// Fine on a laptop, and the reason production refuses to start without its own.
export const DEV_AUTH_SECRET = "dev-only-secret-do-not-use-in-production";

/** Pure, no I/O: reads from a plain object so tests can pass a fake env. Throws on unsafe production config. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const production = env.NODE_ENV === "production";
  // Stryker disable next-line StringLiteral: any placeholder under 32 characters fails the check below the same way.
  const authSecret = env.AUTH_SECRET ?? (production ? "" : DEV_AUTH_SECRET);
  if (production && (authSecret.length < 32 || authSecret === DEV_AUTH_SECRET)) {
    throw new Error("Set AUTH_SECRET to a random value of at least 32 characters before running in production.");
  }

  return {
    port: Number(env.PORT ?? 3000),
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    mongoUrl: env.MONGO_URL ?? "mongodb://localhost:27017/flashsale",
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 5),
    authRateLimitMax: Number(env.AUTH_RATE_LIMIT_MAX ?? 10),
    apiProcesses: Math.max(1, Number(env.API_PROCESSES ?? 1)),
    authSecret,
    webUrl: env.WEB_URL ?? env.VITE_SITE_URL ?? "http://localhost:5173",
    cookieSecure: production || env.COOKIE_SECURE === "true",
    maxEventLoopLagMs: Number(env.MAX_EVENT_LOOP_LAG_MS ?? 200),
    memoryTracker: env.MEMORY_TRACKER === "1",
    freezeProfiler: {
      enabled: env.FREEZE_PROFILER === "1",
      thresholdMs: Number(env.FREEZE_THRESHOLD_MS ?? 500),
      dir: env.FREEZE_PROFILE_DIR ?? "profiles",
      s3Bucket: env.FREEZE_PROFILE_S3_BUCKET || null,
    },
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
  };
}
