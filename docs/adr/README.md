# Architecture Decision Records

Short records of the decisions that would otherwise only live in a reviewer's head (or get re-litigated later). Each one is Context, Decision, Consequences; see `docs/PRD.md` for the design these decisions implement.

- [0001: Atomic Redis Lua script instead of a lock](0001-redis-lua-gate-instead-of-lock.md)
- [0002: Reserve in Redis, confirm asynchronously through a queue](0002-async-order-confirmation-via-queue.md)
- [0003: BullMQ on Redis instead of SQS or RabbitMQ](0003-bullmq-over-managed-queue.md)
- [0004: MongoDB for the durable order record](0004-mongodb-over-postgres.md)
- [0005: pnpm workspaces + Turborepo for the monorepo](0005-pnpm-turborepo-monorepo.md)
- [0006: Custom fetch-based load generator instead of autocannon](0006-fetch-based-stress-harness.md)
- [0007: Scale out with stateless processes; fail fast on startup errors](0007-scale-out-stateless-processes.md)
- [0008: Property-based and mutation tests on top of unit and integration](0008-test-layers.md)
- [0009: Accounts, with the buyer taken from a signed session](0009-accounts-and-sessions.md)
- [0010: Idempotency keys for safe purchase retries](0010-idempotency-keys.md)
- [0011: Fail fast on outages, shed load on saturation](0011-fail-fast-and-load-shedding.md)
- [0012: Graceful shutdown on SIGTERM](0012-graceful-shutdown.md)
- [0013: Opt-in diagnostics: freeze profiler and memory tracker](0013-opt-in-diagnostics.md)
