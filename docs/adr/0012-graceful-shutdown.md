# ADR 0012: Graceful shutdown on SIGTERM

Status: Accepted
Date: 2026-11-18

## Context

Deploys and autoscaling stop processes with SIGTERM. Before this, the API had no handler: Node exited at once, cutting off in-flight purchases between the Lua gate and the enqueue (the unit stayed reserved with no job until `reconcile`). The worker closed BullMQ but left Redis and Mongo connections open and had no deadline.

## Decision

- One helper, `gracefulShutdown(close, deps)` in `packages/core/src/shutdown.ts`: runs `close` once on SIGTERM or SIGINT, exits 0, exits 1 if `close` throws or takes longer than 10 s. A second signal during the drain is ignored.
- API process: `app.close()` (stops accepting, waits for in-flight requests, answers 503 to anything arriving meanwhile), then the queue, then Redis and Mongo.
- Cluster primary: stops replacing children, sends each SIGTERM, exits when all have exited.
- Worker: `worker.close()` waits for active jobs, then Redis and Mongo close. A job that outlives the deadline isn't lost: its lock expires and another worker retries it (the upsert makes that safe).

## Consequences

- A rolling deploy no longer strands reservations from requests in flight.
- 10 s fits inside the default grace period of Kubernetes, ECS and systemd. A longer drain needs that grace period raised too.
- Tested in real processes: `server.test.ts` (one process and cluster) and the worker's `entry.test.ts` send SIGTERM and expect exit 0 with the port freed; the helper itself has unit tests with fake signals and timers.
