# apps/api

Fastify HTTP layer. No business rules here: purchase decisions come from `SaleGate` (core), HTTP mapping from `purchase-response.ts`.

- `app.ts`: `buildApp(deps)` takes every dependency as an argument (Redis, Mongo, queue, gate). Tests swap in failing fakes this way; keep it that way.
- `routes/purchase.ts`: the hot path. Order matters: normalize, gate, enqueue, release on enqueue failure. Rate limited (only this route).
- `server.ts`: entry point and `API_PROCESSES` cluster. Startup failure exits the cluster; serving crash gets replaced.
- `scripts/seed.ts`: writes the sale window.

Tests: unit in `src/__tests__/unit`, integration in `src/__tests__/integration` (Redis db 14, Mongo `flashsale_test`). `ctx.makeApp({...overrides})` builds an app with real deps plus your overrides; `ctx.app` is rebuilt before every test. `server.test.ts` spawns the real entry point on ports 3917/3918.

Changing a status code or response body changes the contract with `apps/web/src/api.ts`: update both, plus the README API table.
