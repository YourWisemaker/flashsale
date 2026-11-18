# ADR 0010: Idempotency keys for safe purchase retries

Status: Accepted
Date: 2026-11-18

## Context

A duplicate order was already impossible, at three layers: the Lua gate records the buyer atomically (one unit per account), the queue job id is fixed per account (BullMQ drops a second enqueue), and the order write is an upsert on a unique `userId` index. Stress and property tests prove it.

What wasn't handled is a lost response. A phone drops signal right after the server reserved the unit; the client retries; the retry correctly gets 409 "already purchased", but to the user that reads as a failure, even though they own the pair.

## Decision

`POST /api/purchase` accepts an optional `Idempotency-Key` header (8 to 128 of `[A-Za-z0-9_-]`), the pattern Stripe uses.

- The key is claimed with `SET NX EX 86400` under `idem:<account>:<key>`: atomic, so of several concurrent requests with one key exactly one runs. Scoped to the account, so keys can't collide or leak across users.
- A key that already has an answer gets that answer back, with `Idempotent-Replayed: true`. A key still in flight gets 409 `in_progress`.
- Every answer is stored for 24 hours, failures included (sold out stays sold out for that key), except a 503: that one is worth retrying, so the key is released and the retry really runs.
- If Redis can't record the key, the purchase answers 503 rather than running without protection.
- The web app sends `crypto.randomUUID()` per click and retries once on a network error with the same key.

## Consequences

- One extra Redis round trip on purchases that carry a key (claim, then save). Purchases without a key skip it; the stress harness sends none, so its numbers measure the same path as before.
- The header is optional, so plain API clients keep working. They still can't create a duplicate order; they just don't get replays.
- Response bodies are stored for 24 hours per key. They're tiny (`{ status, stockLeft }`), and Redis expires them.
