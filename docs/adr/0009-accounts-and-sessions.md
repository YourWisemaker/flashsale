# ADR 0009: Accounts, with the buyer taken from a signed session

Status: Accepted
Date: 2026-11-18

## Context

The brief asks for a user identifier on the purchase. The first version took it from a text box: any string, sent in the request body. That meets the letter of "one item per user", but "user" was whatever someone typed, so one person could buy with "a", "b", "c", and anyone could buy as someone else. Accounts (sign up, log in, forgot and reset password) were then asked for.

The constraint: the purchase path is the one thing that has to stay fast under a spike, and today it touches only Redis.

## Decision

- The buyer is the email inside a signed session token, never anything in the request body. `POST /api/purchase` takes no body.
- Sessions are HS256 JWTs (`fast-jwt`, the library `@fastify/jwt` uses) with the algorithm pinned, in an `httpOnly`, `SameSite=Strict` cookie, `Secure` in production. Verifying one is a signature check in memory, no database lookup, so the hot path still makes zero database calls.
- Passwords: scrypt from Node's crypto, parameters stored in each hash, constant-time compare, a dummy hash for unknown emails so timing doesn't reveal which accounts exist, one error message for every login failure.
- Password reset: 32 random bytes, stored only as a SHA-256 hash with a 30-minute TTL index, consumed by an atomic find-and-delete so it works once even under a race. `/api/auth/forgot` answers the same whether or not the email exists. Checked before consuming the token, so a too-short new password doesn't burn the link.
- Email: no provider in this demo. "Sending" writes to an `outbox` collection; `pnpm cli outbox` and the e2e tests read it. One function to swap for SES or SendGrid.
- Rate limits: purchases per account (keyed by the session's email); auth routes per IP per minute.
- The API refuses to start in production without its own `AUTH_SECRET` of 32+ characters.

## Consequences

- "One per user" now means one per account, and accounts need an email that's unique by index.
- Stress throughput went up, not down (11-13k to 14-18k req/s from one client): requests no longer carry a JSON body, and the signature check is cheaper than the parse it replaced. The harness mints session tokens up front, like users who logged in before the sale opened.
- Sessions can't be revoked one by one before they expire (7 days): it's a stateless token. Logging out clears the cookie on that browser. Rotating `AUTH_SECRET` logs everyone out. A revocation list would put a Redis read on the hot path; not worth it for this scope.
- The e2e suite logs in far more than 10 times a minute from one IP, so it runs with `AUTH_RATE_LIMIT_MAX` raised, the same way stress runs raise the purchase limit.
