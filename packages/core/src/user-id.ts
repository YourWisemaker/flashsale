/**
 * All user identifiers are normalized at this one boundary. Every caller
 * (API routes, worker, tests) must go through here before touching Redis
 * or Mongo, otherwise "Arief" and " arief " would count as two different
 * buyers.
 */
const MAX_LENGTH = 100;
const VALID_PATTERN = /^[a-z0-9._@-]+$/;

export function normalizeUserId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const normalized = raw.trim().toLowerCase();

  // The pattern's `+` already rejects an empty string.
  if (normalized.length > MAX_LENGTH) return null;
  if (!VALID_PATTERN.test(normalized)) return null;

  return normalized;
}
