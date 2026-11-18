# packages/core

The rules every other package depends on. Changes here are shared contracts (see root CLAUDE.md, "Working in parallel"): update every consumer in the same change.

- `lua-scripts.ts`: `PURCHASE_SCRIPT` and `RELEASE_SCRIPT`. The whole concurrency story. Uses Redis `TIME`, never the caller's clock.
- `sale-gate.ts`: `SaleGate` wraps the scripts. `getSnapshot` takes an injectable clock (`now`) for tests; its boundaries must match `purchase.lua` (active from `startsAt` through `endsAt` inclusive).
- `keys.ts`: Redis key names (pinned by a test, renaming orphans live data), `ORDER_JOB_OPTIONS`, `orderJobId`.
- `orders.ts`: Mongo persistence. `confirmOrder` is an upsert with `$setOnInsert`.
- `user-id.ts`: the only place userIds are normalized.

Tests: `pnpm --filter @flashsale/core test` (needs Redis + Mongo). Redis dbs 15 (`sale-gate.test.ts`) and 11 (property tests), Mongo databases `flashsale_test_core*`. Property tests in `*.property.test.ts` check the gate against `ReferenceModel`; if you change a rule, change the model first and watch the property fail.

After any change: `pnpm --filter @flashsale/core build` (consumers read `dist/`), then `pnpm --filter @flashsale/core test:mutation`.
