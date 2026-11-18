# ADR 0003: BullMQ on Redis instead of SQS or RabbitMQ

Status: Accepted
Date: 2026-11-18

## Context

The brief explicitly allows mocking or locally-running the "modern cloud service" pieces (message queues, caches) rather than deploying them, as long as the choice is explained. The system already runs Redis for the purchase gate; the question is what runs the order-confirmation queue on top of it.

## Decision

Use BullMQ, a Node queue library built on Redis, instead of standing up RabbitMQ or simulating SQS. It gives retries with backoff, a failed-job set that serves as the DLQ, and job IDs that make enqueue idempotent (one deterministic id per user), all without a second piece of infrastructure to run, configure, or reason about alongside Redis.

## Consequences

- One infra dependency (Redis) instead of two. Simpler docker-compose, simpler local setup, nothing extra for a reviewer to install.
- BullMQ's "failed" job set is this system's DLQ (`apps/worker/src/scripts/dlq-replay.ts` replays it). The README names it directly as the DLQ, so a reader doesn't have to infer it.
- Swapping to SQS later touches two files: the enqueue call in `apps/api/src/routes/purchase.ts` and the consumer in `apps/worker/src/worker.ts`. The job shape (`OrderJobData` in `packages/core`) and the retry/DLQ semantics don't need to change, SQS has equivalent concepts (visibility timeout plus a redrive policy to a DLQ).
- Retry policy (5 attempts, exponential backoff starting at 500ms) lives in one place, `ORDER_JOB_OPTIONS` in `packages/core/src/keys.ts`, applied when the queue is created.
- Completed jobs are removed (`removeOnComplete: true`); failed jobs are kept, since they're the DLQ. BullMQ silently ignores `add()` for a job id that still exists, so keeping completed jobs meant a returning user in a re-seeded sale stayed "pending" forever. Found by running the stress test twice in a row. Job ids are `order-<userId>` because BullMQ rejects ids that parse as integers.
