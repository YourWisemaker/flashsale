import { createSigner, createVerifier } from "fast-jwt";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Signed session tokens (HS256 JWT). Verifying one is a signature check in
 * memory, no database lookup, so putting auth on the purchase hot path
 * doesn't add a round trip.
 */
export function createSessionTokens(secret: string) {
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.");
  // Stryker disable next-line StringLiteral: equivalent, HS256 is fast-jwt's default for a string key; stated so the verifier's pin below is obviously the same.
  const sign = createSigner({ key: secret, algorithm: "HS256", expiresIn: SESSION_TTL_SECONDS * 1000 });
  // Pinning the algorithm rejects "alg: none" and algorithm-confusion tokens.
  // Stryker disable next-line BooleanLiteral: the cache only skips re-verifying a token seen before; results are identical.
  const verify = createVerifier({ key: secret, algorithms: ["HS256"], cache: true });

  return {
    sign(email: string): string {
      return sign({ sub: email });
    },
    /** The email the token was issued to, or null if it's forged, expired, or malformed. */
    verify(token: string | undefined): string | null {
      // Stryker disable next-line ConditionalExpression: equivalent at runtime (fast-jwt throws on "" and the catch returns null); needed so the type is a string.
      if (!token) return null;
      try {
        const payload = verify(token) as { sub?: unknown };
        return typeof payload.sub === "string" ? payload.sub : null;
      } catch {
        return null;
      }
    },
  };
}

export type SessionTokens = ReturnType<typeof createSessionTokens>;
