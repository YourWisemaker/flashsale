# Load Shedding and Resilience Implementation Plan

> **For agentic workers:** use superpowers:executing-plans to work this task by task. Steps use checkbox (`- [ ]`) syntax.

**Status:** Done (ADR 0011).

**Goal:** Make the API answer a quick 503 instead of hanging when Redis or Mongo is down, shed load when a process is saturated, and keep display reads off the databases, all without touching the purchase gate's guarantees.

**Architecture:** One app-level `onRequest` hook in `apps/api/src/load-shedding.ts` checks ioredis connection state and event loop lag before any route hook runs. Fail-fast client options in `apps/api/src/server.ts` only (the worker keeps patient defaults). A Fastify error handler maps Mongo connection errors to 503. Product data cached per process; sale status gets a CDN-only cache header.

**Tech Stack:** Fastify 5 hooks, ioredis 5 (`status`, `maxRetriesPerRequest`), MongoDB driver 6 (`serverSelectionTimeoutMS`), `node:perf_hooks` `monitorEventLoopDelay`.

---

### Task 1: Fail-fast client options

**Files:** `packages/core/src/redis.ts`, `packages/core/src/mongo.ts`, `apps/api/src/server.ts`

- [x] `createRedisClient(url, options = {})` and `connectMongo(url, options = {})` pass options through.
- [x] API passes `{ maxRetriesPerRequest: 1 }` and `{ serverSelectionTimeoutMS: 2000 }`. No `commandTimeout` (a timed-out `EVALSHA` may have reserved a unit).
- [x] `pnpm --filter @flashsale/core build && pnpm typecheck`

### Task 2: Load-shedding hook

**Files:** `apps/api/src/load-shedding.ts`, `apps/api/src/app.ts`, `apps/api/src/config.ts`, tests in `__tests__/unit/load-shedding.test.ts`, `__tests__/integration/resilience.test.ts`

- [x] Pure `isOverloaded(lagMs, maxLagMs)`; 0 turns it off. Unit tests for the edge (equal is not overloaded, NaN is not).
- [x] Hook: `/api/product` exempt; Redis not `ready` gives 503; lag past `MAX_EVENT_LOOP_LAG_MS` (default 200) gives 503 + `retry-after: 1`.
- [x] Integration: dead Redis on port 1 answers 503 in under 500ms; sustained lag sheds a purchase without touching stock; a healthy loop with a 15ms limit doesn't shed.
- [x] Add `MAX_EVENT_LOOP_LAG_MS` to `.env.example`, README config table, `turbo.json` `globalPassThroughEnv`.

### Task 3: Mongo outage is 503

**Files:** `apps/api/src/app.ts`, `resilience.test.ts`

- [x] `setErrorHandler`: `MongoServerSelectionError`, `MongoNetworkError`, `MongoTopologyClosedError` give 503; anything else rethrows to Fastify.
- [x] Test: dead Mongo gives 503 on `/api/purchase/me` and login; a malformed JSON body is still 400.

### Task 4: Caching

**Files:** `apps/api/src/routes/product.ts`, `apps/api/src/routes/sale.ts`

- [x] Product: 60s in-process cache with injectable `now`, never caches a 404.
- [x] Sale: `cache-control: public, max-age=0, s-maxage=1`.
- [x] Tests for TTL expiry with a fake clock, and seed-after-404.

### Task 5: Verify and document

- [x] `pnpm test && pnpm test:integration && pnpm --filter @flashsale/api test:mutation` (100%)
- [x] `pnpm stress` with shedding on: 16k to 19k req/s, zero 503s, every invariant passes.
- [x] ADR 0011, README resilience section, `docs/architecture.md`, `CLAUDE.md` invariant 12, Mintlify `concepts/resilience.mdx`, OpenAPI 503 responses.
