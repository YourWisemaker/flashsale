# ADR 0002: Reserve in Redis, confirm the order asynchronously through a queue

Status: Accepted
Date: 2026-11-18

## Context

A purchase attempt needs to both decide fast (so the API stays responsive under a traffic spike) and leave a durable record (Redis alone isn't where you want the system of record for "who bought the product"). Writing to MongoDB synchronously, inside the request, would put a database write on the hot path for every one of thousands of simultaneous requests.

## Decision

The API's hot path only touches Redis: the Lua script decides `reserved`, `already_purchased`, `sold_out`, `upcoming`, or `ended`, and that's the full HTTP response path for a decision. A `reserved` outcome enqueues a job (BullMQ, see ADR 0003) and returns `202 pending` immediately. A separate worker process consumes the queue and upserts the confirmed order into MongoDB. The per-user status endpoint reflects `pending` until that upsert lands, then `confirmed`.

## Consequences

- MongoDB never sees a write burst; it sees exactly as many writes as units of stock, paced by the worker's concurrency.
- The user-visible cost: a `pending` state between the purchase call and confirmation, usually milliseconds under normal load, longer if the worker is behind. The frontend polls for this and renders it on screen as "Purchase received, confirming...".
- If the enqueue itself fails after the Redis reservation succeeded, the reservation would otherwise be stuck without the queue job that's supposed to confirm it. The API calls `release.lua` in that case and returns `503`, so the unit goes back into stock and the user can retry. See `docs/PRD.md` section 8 for the full failure table.
- This is the trade-off being justified instead of hidden: pragmatism over a "simpler" synchronous write that would fall over under load.
