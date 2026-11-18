# apps/worker

BullMQ consumer: takes `confirm-order` jobs and calls `confirmOrder` (core). Thin on purpose; retries and DLQ behavior come from `ORDER_JOB_OPTIONS` in core.

- `worker.ts`: builds the `Worker`. `processor.ts`: one job, one upsert.
- `scripts/dlq-replay.ts`: moves failed jobs back to the queue. `scripts/reconcile.ts`: rebuilds Redis buyers/stock from Mongo plus queued jobs after a Redis loss.
- Scale by running more worker processes; each job goes to exactly one.

Tests: Redis db 13, Mongo `flashsale_test_worker`, `fileParallelism: false` because files share those. Await `worker.waitUntilReady()` before adding jobs, and use unique job ids per test.

Ops scripts run against whatever `.env` points at. They're not covered by mutation testing (wiring only); test them by hand against a seeded dev stack.
