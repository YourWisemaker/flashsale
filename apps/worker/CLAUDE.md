# apps/worker

BullMQ consumer: takes `confirm-order` jobs and calls `confirmOrder` (core). Thin on purpose; retries and DLQ behavior come from `ORDER_JOB_OPTIONS` in core.

- `worker.ts`: builds the `Worker`. `processor.ts`: one job, one upsert.
- DLQ replay and Redis reconcile are ops commands in `apps/cli` (`pnpm cli dlq:replay`, `pnpm cli reconcile`).
- Scale by running more worker processes; each job goes to exactly one.

Tests: Redis db 13, Mongo `flashsale_test_worker`, `fileParallelism: false` because files share those. Await `worker.waitUntilReady()` before adding jobs, and use unique job ids per test.

`src/index.ts` is wiring only and excluded from mutation testing.
