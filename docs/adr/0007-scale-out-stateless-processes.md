# ADR 0007: Scale out with stateless processes; fail fast on startup errors

Status: Accepted
Date: 2026-11-18

## Context

One Node process uses one CPU core. The design already kept the API and worker stateless (every purchase decision lives in Redis), so more throughput should come from more processes, not bigger ones. That claim had only ever run as a single process.

## Decision

- `API_PROCESSES=N` forks N full API processes sharing the port with Node's built-in `cluster` module. No new dependency, and the same shape as N containers behind a load balancer.
- A process that crashes while serving is replaced.
- A process that dies before it ever listened is treated as a startup error (port taken, Redis or Mongo unreachable at boot). The whole cluster exits with code 1 and lets the process supervisor decide.
- Workers scale by starting more of them. BullMQ hands each job to exactly one.
- Rate limiting applies to `POST /api/purchase` only, so status polling never eats a user's purchase budget.

## Consequences

- Measured on an 8-core laptop: 33,700 req/s with 1 API process, 52,700 with 2, 42,300 with 4. Past 2, Redis (424,000 ops/s, about 10 ops per purchase) and CPU shared with the load generator are the limit. Next levers are in `docs/architecture.md`.
- The fail-fast rule exists because the first version replaced every dead process unconditionally. With the port taken, that fork-looped hundreds of times a second and pinned every core. `apps/api/src/__tests__/integration/server.test.ts` checks the exit code, and that test fails against the old behavior.
- Correctness across processes is checked by the stress run on 2 API + 2 worker processes: every invariant passes, and jobs split 1,067 / 1,034.
