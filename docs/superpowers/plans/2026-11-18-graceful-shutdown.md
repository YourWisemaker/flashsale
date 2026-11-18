# Graceful Shutdown Implementation Plan

> **For agentic workers:** use superpowers:executing-plans to work this task by task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On SIGTERM or SIGINT, the API and worker finish what they're doing, close their connections, and exit 0, so a deploy or scale-down never cuts a purchase or an order confirmation in half.

**Architecture:** One `gracefulShutdown(close, deps)` helper in `packages/core/src/shutdown.ts` with injected `on`, `exit`, `log`, `timeoutMs` (default 10s). Each entry point passes its own `close`: API drains Fastify, then the queue, then Redis and Mongo; the cluster primary stops respawning, forwards SIGTERM to children and waits; the worker runs `worker.close()` (waits for active jobs), then closes connections.

**Tech Stack:** Node signals, `node:cluster`, Fastify `close()`, BullMQ `Worker.close()`, ioredis `quit()`, MongoClient `close()`.

---

### Task 1: Helper in core

**Files:** `packages/core/src/shutdown.ts`, `packages/core/src/index.ts`, `packages/core/src/__tests__/shutdown.test.ts`

- [x] Runs `close` once per process; a second signal while closing is ignored.
- [x] Exit 0 on success, 1 on throw, 1 when the deadline passes; the deadline is cleared on success.
- [x] Unit tests with an EventEmitter and fake timers; one child-process test with the real defaults.
- [x] `pnpm --filter @flashsale/core build && pnpm --filter @flashsale/core test`

### Task 2: API

**Files:** `apps/api/src/server.ts`, `apps/api/src/__tests__/integration/server.test.ts`

- [x] Single process: `app.close()`, `queue.close()`, then `queueConnection.quit()`, `redis.quit()`, `mongo.close()`.
- [x] Cluster primary: `stopping` flag stops the respawn; SIGTERM each child and wait for every `exit`.
- [x] Test both: spawn on ports 3919/3920, wait for health, SIGTERM, expect exit 0 and the port closed.

### Task 3: Worker

**Files:** `apps/worker/src/index.ts`, `apps/worker/src/__tests__/integration/entry.test.ts`

- [x] Replace the ad-hoc signal handler with `gracefulShutdown`: `worker.close()`, then `connection.quit()` and `mongo.close()`.
- [x] Test: spawn the entry point, wait for "worker running", SIGTERM, expect exit 0.

### Task 4: Verify and document

- [x] `pnpm typecheck && pnpm test && pnpm test:integration`
- [x] `pnpm test:mutation` on core and api (shutdown defaults marked: they run in a child process Stryker can't switch).
- [x] README resilience section, docs site resilience page and ADR 0012 describe the shutdown order and the 10s deadline.
