import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";

describe("loadConfig", () => {
  it("applies defaults when env is empty", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.mongoUrl).toBe("mongodb://localhost:27017/flashsale");
    expect(config.rateLimitMax).toBe(5);
    expect(config.apiProcesses).toBe(1);
  });

  it("reads overrides from env", () => {
    const config = loadConfig({ PORT: "4000", RATE_LIMIT_MAX: "50", SALE_STOCK: "200" });
    expect(config.port).toBe(4000);
    expect(config.rateLimitMax).toBe(50);
    expect(config.defaultStockIfUnset).toBe(200);
  });

  it("runs at least one API process even if API_PROCESSES is zero or negative", () => {
    expect(loadConfig({ API_PROCESSES: "4" }).apiProcesses).toBe(4);
    expect(loadConfig({ API_PROCESSES: "0" }).apiProcesses).toBe(1);
    expect(loadConfig({ API_PROCESSES: "-2" }).apiProcesses).toBe(1);
  });
});
