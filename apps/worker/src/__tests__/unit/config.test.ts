import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";

describe("loadConfig", () => {
  it("applies defaults when env is empty", () => {
    const config = loadConfig({});
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.mongoUrl).toBe("mongodb://localhost:27017/flashsale");
    expect(config.concurrency).toBe(10);
  });

  it("reads overrides from env", () => {
    const config = loadConfig({ WORKER_CONCURRENCY: "25" });
    expect(config.concurrency).toBe(25);
  });
});
