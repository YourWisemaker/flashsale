import { describe, expect, it } from "vitest";
import { IDEMPOTENCY_HEADER, IDEMPOTENCY_TTL_SECONDS, readIdempotencyKey } from "../../idempotency.js";

describe("readIdempotencyKey", () => {
  it("treats a missing header as no key (the header is optional)", () => {
    expect(readIdempotencyKey(undefined)).toBeNull();
  });

  it.each(["abcdefgh", "a".repeat(128), "0b5f6e4a-9c1d-4c8e-8f1a-2d3c4b5a6e7f", "key_with-dashes_123"])("accepts %j", (key) => {
    expect(readIdempotencyKey(key)).toBe(key);
  });

  it.each(["short", "a".repeat(129), "has space in it", "semi;colon-key", "", "üñíçødé-key"])("rejects %j", (key) => {
    expect(readIdempotencyKey(key)).toBe("invalid");
  });

  it("rejects the header sent twice", () => {
    expect(readIdempotencyKey(["abcdefgh", "abcdefgh"])).toBe("invalid");
  });

  it("uses the standard header name and keeps keys for a day", () => {
    expect(IDEMPOTENCY_HEADER).toBe("idempotency-key");
    expect(IDEMPOTENCY_TTL_SECONDS).toBe(86_400);
  });
});
