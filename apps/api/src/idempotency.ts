import type { Redis } from "ioredis";

/**
 * Idempotency-Key support for POST /api/purchase (the pattern Stripe uses).
 *
 * Duplicate orders are already impossible without this: the Lua gate
 * records the buyer atomically, the job id is fixed per user, and the
 * order write is an upsert on a unique index. What this adds is a safe
 * retry: if a response is lost (phone drops signal right after the
 * server reserved the unit), resending with the same key returns the
 * original answer instead of "already purchased", and never touches stock.
 */
export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const IN_PROGRESS = "in_progress";
const KEY_PATTERN = /^[\w-]{8,128}$/;

export interface StoredResponse {
  httpCode: number;
  body: unknown;
}

export type Claim = { state: "claimed" } | { state: "in_progress" } | { state: "replay"; response: StoredResponse };

/** Null when the header is absent (allowed), "invalid" when present but malformed. */
export function readIdempotencyKey(header: string | string[] | undefined): string | null | "invalid" {
  if (header === undefined) return null;
  // Stryker disable next-line ConditionalExpression: equivalent at runtime (a repeated header joins with ",", which the pattern rejects); needed for the type.
  return typeof header === "string" && KEY_PATTERN.test(header) ? header : "invalid";
}

export function createIdempotencyStore(redis: Redis) {
  // Scoped per user: one account can't read or collide with another's keys.
  const redisKey = (userId: string, key: string) => `idem:${userId}:${key}`;

  return {
    /** Atomic: exactly one request with a given key gets "claimed". */
    async claim(userId: string, key: string): Promise<Claim> {
      const claimed = await redis.set(redisKey(userId, key), IN_PROGRESS, "EX", IDEMPOTENCY_TTL_SECONDS, "NX");
      if (claimed === "OK") return { state: "claimed" };

      const existing = await redis.get(redisKey(userId, key));
      // Expired or released between the two calls: treat as still running and let the client retry.
      if (existing === null || existing === IN_PROGRESS) return { state: "in_progress" };
      return { state: "replay", response: JSON.parse(existing) as StoredResponse };
    },

    async save(userId: string, key: string, response: StoredResponse): Promise<void> {
      await redis.set(redisKey(userId, key), JSON.stringify(response), "EX", IDEMPOTENCY_TTL_SECONDS);
    },

    /** For outcomes worth retrying (503): forget the key so the retry really runs. */
    async release(userId: string, key: string): Promise<void> {
      await redis.del(redisKey(userId, key));
    },
  };
}

export type IdempotencyStore = ReturnType<typeof createIdempotencyStore>;
