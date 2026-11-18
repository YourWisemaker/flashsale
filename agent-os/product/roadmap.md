# Roadmap

## Done

- [x] Atomic Redis Lua purchase gate: window, dedupe, stock, decrement in one step (ADR 0001)
- [x] Async order confirmation through BullMQ, failed set as DLQ (ADR 0002, 0003)
- [x] Accounts and signed sessions; buyer comes from the cookie (ADR 0009)
- [x] Idempotency-Key on purchase (ADR 0010)
- [x] Fail fast on Redis/Mongo outages, load shedding on event loop lag, display-data caching (ADR 0011)
- [x] Ops CLI: seed, clean up, reconcile, DLQ replay, outbox
- [x] OpenAPI spec, Swagger UI at /docs, Mintlify docs site
- [x] Blue and white storefront redesign, screenshots retaken
- [x] Graceful shutdown for API (single and cluster) and worker

## In progress

- [x] Memory tracker in `apps/api/src/libs/`, flag-gated, off by default (ADR 0013)
- Dropped: freeze profiler, `libs/aws`, `libs/ai-agent`. Built, then removed as beyond the brief; load shedding already covers saturation.

## Open decision

- [ ] **Virtual waiting room.** Current call: not needed. The Redis gate answers in about a millisecond, so there is no slow backend to protect; rate limits and the queue shape the spike. Plan with options in `.pi/plans/`. Revisit if a payment step or a slow downstream is added.

## Later, if this went to production

- [ ] Managed Redis with a replica and failover
- [ ] Rate limiting at the gateway
- [ ] Decide on `autoResendUnfulfilledCommands` for the API Redis client (REPOSITORY_ANALYSIS.md, risk 3)
