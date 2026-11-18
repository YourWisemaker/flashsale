import { Redis, type RedisOptions } from "ioredis";

/** Used by SaleGate and the API's rate limiter. */
export function createRedisClient(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, options);
}

/** BullMQ requires this exact setting on its own connection. */
export function createQueueConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
