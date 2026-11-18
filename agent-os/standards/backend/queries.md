# Queries (Redis and MongoDB)

- **Redis hot path**: one `EVALSHA` per purchase decision. Never split check-and-decrement into separate commands (invariant 1). Use `SCAN`, never `KEYS`, outside tests.
- **Mongo reads are off the purchase path**: `GET /api/purchase/me`, auth, product (cached 60s in process).
- **Every query has an index**: `orders.userId` unique, `users.email` unique, `password_resets.tokenHash` unique plus TTL on `expiresAt`. Add the index in the matching `ensure*Indexes` function, which `pnpm cli migrate` runs.
- **Project out secrets**: never return `passwordHash` or `tokenHash`.
- **Writes are idempotent**: `confirmOrder` is an upsert on `userId`; a retried job is harmless.
- Inspect real data read-only with `.claude/skills/read-database`.
