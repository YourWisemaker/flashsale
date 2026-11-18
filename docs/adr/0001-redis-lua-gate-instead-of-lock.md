# ADR 0001: Atomic Redis Lua script instead of a distributed lock

Status: Accepted
Date: 2026-11-18

## Context

The core problem is concurrency control on a shared counter (stock) plus a per-user dedupe check. Both reference drawings for this kind of system (see `docs/PRD.md` section 4) show an "Acquire Lock / Grant Lock" step around the order service: get a lock, do the check-and-decrement, release the lock.

A lock needs three round trips (acquire, work, release) and a TTL, because a client can die while holding it. Get the TTL wrong and you either block everyone behind a lock that outlives its owner, or release a lock early and let two requests through.

## Decision

Replace the lock with one atomic Redis Lua script (`packages/core/src/lua-scripts.ts`) that does the whole decision in one round trip: check the sale window (using Redis's own `TIME`, not the caller's clock), check if the user already bought, check stock, decrement, record the buyer. Redis runs a script to completion before touching the next command, so two requests racing for the last unit cannot both pass.

## Consequences

- One round trip instead of three. No lock TTL to tune, nothing to leak if a client dies mid-request.
- The logic lives in Lua, which is less familiar to review than application code. Kept the script short and commented for that reason.
- All serialization happens on a single Redis instance. That instance is a bottleneck and a single point of failure; see ADR 0004 for how that's mitigated and what's left as a known gap.
- Verified directly: `packages/core/src/__tests__/sale-gate.test.ts` fires 200 concurrent purchases at 50 units of stock and asserts exactly 50 reservations, and fires 30 concurrent purchases from the same user and asserts exactly 1 reservation.
