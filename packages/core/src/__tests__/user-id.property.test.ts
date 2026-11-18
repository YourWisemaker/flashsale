import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeUserId } from "../user-id.js";

// Strings built only from characters a valid id may contain, in any case.
const validChar = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._@-");
const validId = fc.stringOf(validChar, { minLength: 1, maxLength: 100 });
const padding = fc.stringOf(fc.constantFrom(" ", "\t", "\n"), { maxLength: 5 });

describe("normalizeUserId properties", () => {
  it("is idempotent: normalizing twice gives the same id", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const once = normalizeUserId(raw);
        if (once !== null) expect(normalizeUserId(once)).toBe(once);
      }),
    );
  });

  it("only ever returns a lowercase, trimmed id within the allowed charset and length", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (raw) => {
        const id = normalizeUserId(raw);
        if (id === null) return;
        expect(id).toBe(id.trim().toLowerCase());
        expect(id).toMatch(/^[a-z0-9._@-]{1,100}$/);
      }),
    );
  });

  it("maps any casing and surrounding whitespace of the same id to one user", () => {
    fc.assert(
      fc.property(validId, padding, padding, (id, left, right) => {
        expect(normalizeUserId(`${left}${id.toUpperCase()}${right}`)).toBe(id.toLowerCase());
      }),
    );
  });

  it("rejects anything that isn't a string", () => {
    fc.assert(
      fc.property(fc.anything().filter((v) => typeof v !== "string"), (value) => {
        expect(normalizeUserId(value)).toBeNull();
      }),
    );
  });
});
