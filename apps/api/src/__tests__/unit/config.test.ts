import { describe, expect, it } from "vitest";
import { DEV_AUTH_SECRET, loadConfig } from "../../config.js";

describe("loadConfig", () => {
  it("applies development defaults when env is empty", () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      redisUrl: "redis://localhost:6379",
      mongoUrl: "mongodb://localhost:27017/flashsale",
      rateLimitMax: 5,
      authRateLimitMax: 10,
      apiProcesses: 1,
      authSecret: DEV_AUTH_SECRET,
      webUrl: "http://localhost:5173",
      cookieSecure: false,
      maxEventLoopLagMs: 200,
      memoryTracker: false,
    });
  });

  it("reads overrides from env", () => {
    const config = loadConfig({
      PORT: "4000",
      RATE_LIMIT_MAX: "50",
      AUTH_RATE_LIMIT_MAX: "3",
      AUTH_SECRET: "x".repeat(40),
      WEB_URL: "https://shop.example",
      COOKIE_SECURE: "true",
      MAX_EVENT_LOOP_LAG_MS: "0",
    });
    expect(config).toMatchObject({ maxEventLoopLagMs: 0, port: 4000, rateLimitMax: 50, authRateLimitMax: 3, authSecret: "x".repeat(40), webUrl: "https://shop.example", cookieSecure: true });
  });

  it("has a development secret long enough for session signing", () => {
    expect(DEV_AUTH_SECRET).toBe("dev-only-secret-do-not-use-in-production");
    expect(DEV_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("falls back to VITE_SITE_URL for links in emails", () => {
    expect(loadConfig({ VITE_SITE_URL: "https://site.example" }).webUrl).toBe("https://site.example");
  });

  it("only turns on secure cookies for the exact value true", () => {
    expect(loadConfig({ COOKIE_SECURE: "yes" }).cookieSecure).toBe(false);
  });

  it("runs at least one API process even if API_PROCESSES is zero or negative", () => {
    expect(loadConfig({ API_PROCESSES: "4" }).apiProcesses).toBe(4);
    expect(loadConfig({ API_PROCESSES: "0" }).apiProcesses).toBe(1);
    expect(loadConfig({ API_PROCESSES: "-2" }).apiProcesses).toBe(1);
  });

  describe("in production", () => {
    const prod = (env: NodeJS.ProcessEnv) => loadConfig({ NODE_ENV: "production", ...env });

    it("refuses to start without its own AUTH_SECRET", () => {
      const message = "Set AUTH_SECRET to a random value of at least 32 characters before running in production.";
      expect(() => prod({})).toThrow(message);
      expect(() => prod({ AUTH_SECRET: "x".repeat(31) })).toThrow(message);
      expect(() => prod({ AUTH_SECRET: DEV_AUTH_SECRET })).toThrow(message);
    });

    it("starts with a strong secret, and forces secure cookies", () => {
      expect(prod({ AUTH_SECRET: "x".repeat(32) })).toMatchObject({ authSecret: "x".repeat(32), cookieSecure: true });
    });
  });

  it("turns the memory tracker on only for the exact value 1", () => {
    expect(loadConfig({ MEMORY_TRACKER: "1" }).memoryTracker).toBe(true);
    expect(loadConfig({ MEMORY_TRACKER: "true" }).memoryTracker).toBe(false);
  });
});
