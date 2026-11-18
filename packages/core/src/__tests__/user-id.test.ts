import { describe, expect, it } from "vitest";
import { normalizeUserId } from "../user-id.js";

describe("normalizeUserId", () => {
  it("trims and lowercases", () => {
    expect(normalizeUserId("  Arief ")).toBe("arief");
  });

  it("treats differently-cased input as the same user", () => {
    expect(normalizeUserId("Arief")).toBe(normalizeUserId("arief "));
  });

  it("accepts emails", () => {
    expect(normalizeUserId("Jane@Example.com")).toBe("jane@example.com");
  });

  it("rejects empty or whitespace-only input", () => {
    expect(normalizeUserId("")).toBeNull();
    expect(normalizeUserId("   ")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(normalizeUserId(123)).toBeNull();
    expect(normalizeUserId(null)).toBeNull();
    expect(normalizeUserId(undefined)).toBeNull();
    expect(normalizeUserId({})).toBeNull();
  });

  it("accepts exactly the max length and rejects one over", () => {
    expect(normalizeUserId("a".repeat(100))).toBe("a".repeat(100));
    expect(normalizeUserId("a".repeat(101))).toBeNull();
  });

  it("measures length after trimming", () => {
    expect(normalizeUserId(`  ${"a".repeat(100)}  `)).toBe("a".repeat(100));
  });

  it("rejects characters outside the allowed set", () => {
    expect(normalizeUserId("arief fitranto")).toBeNull();
    expect(normalizeUserId("<script>")).toBeNull();
  });
});
