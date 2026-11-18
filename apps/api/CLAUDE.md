# apps/api

Fastify HTTP layer. No business rules here: purchase decisions come from `SaleGate` (core), auth rules from core's `auth/`, HTTP mapping from `purchase-response.ts`.

- `app.ts`: `buildApp(deps)` takes every dependency as an argument (Redis, Mongo, queue, gate, session signer). Tests swap in failing fakes this way; keep it that way. Also sets the security headers on every response (`onSend`), errors included.
- `session.ts`: the session cookie (set, clear, `requireUser`). The only place cookie flags are decided.
- `routes/purchase.ts`: the hot path. Order matters: `requireUser`, per-account rate limit, idempotency claim (if the header is present), gate, enqueue, release on enqueue failure, save or release the idempotency key.
- `idempotency.ts`: `Idempotency-Key` claim/replay/release in Redis, scoped per account. The buyer is `request.user` from the session, never the body. No database call here.
- `routes/auth.ts`: register, login, logout, me, forgot, reset. Per-IP rate limit. Same answer for "no such email" and "wrong password", and for forgot on unknown emails.
- `routes/product.ts`: display data, cacheable. Never read on the purchase path.
- `server.ts`: entry point and `API_PROCESSES` cluster. Startup failure exits the cluster; a serving crash gets replaced.
- `config.ts`: refuses to start in production without a real `AUTH_SECRET`.

Seeding and ops live in `apps/cli`, not here.

Tests: unit in `src/__tests__/unit`, integration in `src/__tests__/integration` (Redis db 14, Mongo `flashsale_test`). `ctx.makeApp({...overrides})` builds an app with real deps plus your overrides; `ctx.app` is rebuilt before every test; `ctx.as(email)` gives headers with a valid session cookie. `server.test.ts` spawns the real entry point on ports 3917/3918.

Changing a status code or response body changes the contract with `apps/web/src/api.ts`: update both, plus the README API table.
