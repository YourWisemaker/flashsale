# ADR 0011: Fail fast on outages, shed load on saturation

Status: Accepted
Date: 2026-11-18

## Context

The brief asks for a system that stays up under load and survives failures. Before this change, two failure modes made things worse than they had to be:

- With Redis down, ioredis queued every command and retried 20 times before giving up. With Mongo down, the driver waited 30 seconds to pick a server. Requests piled up in memory while users stared at a spinner.
- A saturated API process kept accepting work and got slower for everyone, rather than refusing some requests quickly.

Page loads also hit Mongo once per visitor for product data that only changes on re-seed.

## Decision

- **Fail fast.** The API's Redis client uses `maxRetriesPerRequest: 1`; its Mongo client uses `serverSelectionTimeoutMS: 2000`. The worker keeps the patient defaults so a short Mongo blip retries rather than filling the DLQ.
- **Mongo outage is a 503.** An error handler maps `MongoServerSelectionError`, `MongoNetworkError` and `MongoTopologyClosedError` to 503 `unavailable`; every other error goes to Fastify's default handler.
- **Breaker on connection state.** An app-level `onRequest` hook answers 503 `unavailable` while `redis.status !== "ready"`, before session checks, the rate limiter or the gate touch Redis. `/api/product` is exempt: the shop page still renders. No breaker library; ioredis already tracks the state.
- **Shed on event loop lag.** `monitorEventLoopDelay` samples lag every 500ms. Past `MAX_EVENT_LOOP_LAG_MS` (default 200, 0 = off) the API answers 503 with `retry-after: 1`. `/health` is shed too, so a load balancer pulls the busy instance.
- **Cache display data.** `/api/product` is cached in process for 60s (never a 404). `/api/sale` sends `public, max-age=0, s-maxage=1`: a CDN can hold it for 1s, browsers always refetch.

Both 503s fire before the purchase gate, so a shed request never holds a unit.

Not done, on purpose: a timeout on Redis commands (`commandTimeout`). A timed-out `EVALSHA` may already have reserved a unit; answering 503 then strands it.

## Consequences

- Redis down: 503 in well under a second instead of a long hang (integration test asserts < 500ms).
- The stress run at 16,000 to 19,000 req/s shed zero requests at the 200ms default.
- Re-seeding the product shows up within 60 seconds on each API process.
- Not built: a virtual waiting room (the Redis gate answers in about a millisecond, so there's no slow backend to protect) and timed stock holds (the brief has no payment step, so a reservation is final).
