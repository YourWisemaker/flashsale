import { describe, expect, it } from "vitest";
import { createQueueConnection, createRedisClient } from "../redis.js";

const URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379";

describe("redis connections", () => {
  it("creates a working client for the gate", async () => {
    const client = createRedisClient(URL);
    expect(await client.ping()).toBe("PONG");
    await client.quit();
  });

  it("creates the queue connection with maxRetriesPerRequest disabled, as BullMQ requires", async () => {
    const connection = createQueueConnection(URL);
    expect(connection.options.maxRetriesPerRequest).toBeNull();
    await connection.quit();
  });
});
