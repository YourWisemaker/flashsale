# apps/api

Fastify HTTP layer. No business rules here: purchase decisions come from `SaleGate` (core), auth rules from core's `auth/`, HTTP mapping from `purchase-response.ts`.

- `app.ts`: `buildApp(deps)` takes every dependency as an argument (Redis, Mongo, queue, gate, session signer). Tests swap in failing fakes this way; keep it that way. Also sets the security headers on every response (`onSend`), errors included.
- `session.ts`: the session cookie (set, clear, `requireUser`). The only place cookie flags are decided.
- `routes/purchase.ts`: the hot path. Order matters: `requireUser`, per-account rate limit, idempotency claim (if the header is present), gate, enqueue, release on enqueue failure, save or release the idempotency key.
- `idempotency.ts`: `Idempotency-Key` claim/replay/release in Redis, scoped per account. The buyer is `request.user` from the session, never the body. No database call here.
- `routes/auth.ts`: register, login, logout, me, forgot, reset. Per-IP rate limit. Same answer for "no such email" and "wrong password", and for forgot on unknown emails.
- `routes/product.ts`: display data, 60 s in-process cache (never caches a 404). Never read on the purchase path.
- `load-shedding.ts`: app-level `onRequest` hook. 503 while Redis isn't ready (product exempt), 503 + `retry-after` past `MAX_EVENT_LOOP_LAG_MS`. Runs before route hooks, so before the rate limiter and the gate.
- `server.ts`: entry point and `API_PROCESSES` cluster. Startup failure exits the cluster; a serving crash gets replaced. SIGTERM drains through `gracefulShutdown` (children drain themselves; the primary waits).
- `libs/`: opt-in diagnostics, each with a README. `freeze-profiler` (CPU profile on event loop stalls), `memory-tracker` (`GET /debug/memory`, only registered when on), `aws` (S3 store), `ai-agent` (Claude explanation of a capture). All dependencies injected; tests use fakes.
- `config.ts`: refuses to start in production without a real `AUTH_SECRET`.

Seeding and ops live in `apps/cli`, not here.

Tests: unit in `src/__tests__/unit`, integration in `src/__tests__/integration` (Redis db 14, Mongo `flashsale_test`). `ctx.makeApp({...overrides})` builds an app with real deps plus your overrides; `ctx.app` is rebuilt before every test; `ctx.as(email)` gives headers with a valid session cookie. `server.test.ts` spawns the real entry point on ports 3917 to 3920.

Changing a status code or response body changes the contract with `apps/web/src/api.ts`: update both, plus the README API table and `openapi.yaml` (then copy it to `apps/docs/api-reference/`). `openapi.test.ts` fails if a served route is missing from the spec; `pnpm test` in `apps/docs` fails if the docs copy drifts. The spec is served static (Swagger UI at `/docs`), so route serialization is untouched.
