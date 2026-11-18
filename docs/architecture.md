# Architecture

This redraws the two reference diagrams (load balancer + lock pattern, and order service + queue + DLQ pattern) as one system, with the lock replaced by an atomic Redis script. The reasoning behind each swap is in `docs/adr/`.

## Diagram

```mermaid
flowchart TD
    U["User / React app"] -->|"HTTPS + session cookie"| LB["Load balancer"]

    subgraph APIS["API: N stateless Fastify instances"]
        direction LR
        API1["API instance 1"]
        API2["API instance N"]
    end
    LB --> API1
    LB --> API2

    subgraph REDIS["Redis: one server, two jobs"]
        direction LR
        GATE[("Purchase gate (synchronous)<br/>sale:config, sale:stock, sale:buyers<br/>rate-limit counters, idem:*")]
        QUEUE[["Order queue (asynchronous)<br/>BullMQ: bull:orders:*"]]
        DLQ[["Failed set (DLQ)<br/>bull:orders:failed"]]
    end

    APIS -->|"1. rate limit, Idempotency-Key,<br/>purchase.lua (atomic)"| GATE
    APIS -->|"2. enqueue (jobId = order-userId)"| QUEUE

    subgraph WORKERS["Workers: N processes"]
        direction LR
        W1["Order worker 1"]
        W2["Order worker N"]
    end
    QUEUE --> W1
    QUEUE --> W2

    WORKERS -->|"upsert, unique index on userId"| M[("MongoDB<br/>durable orders, accounts, product")]
    WORKERS -->|"after 5 failed attempts"| DLQ
    DLQ -.->|"pnpm cli dlq:replay"| QUEUE
    APIS -.->|"order status, accounts, product (off the purchase path)"| M
```

Redis is drawn as one box with two parts because it does two different jobs on one server. The **purchase gate** is read and written inside the request: every API instance runs the same atomic `purchase.lua` against the same keys, which is what makes the decision correct no matter which instance a request lands on. The **order queue** is BullMQ's job list: an instance drops a job and answers `202 pending` at once, and whichever worker is free writes the durable order to MongoDB afterwards. The buyer only waits for the gate. In production the two can move to separate Redis instances.

Locally the load balancer box isn't run; `API_PROCESSES=N` gives N API processes on one host instead, and you start as many workers as you like. The diagram shows the shape that scales: both API and worker are stateless and can run as many copies as traffic needs, because every copy talks to the same Redis and Mongo.

## Components

**React frontend (Arief Shop).** A marketplace-style product page plus log in, sign up, forgot and reset password pages. Loads `GET /api/product` once (display data, cacheable), polls `GET /api/sale` every 2 seconds for status and stock, posts to `/api/purchase` on "Buy Now" (the session cookie says who's buying), and after a `pending` result polls `GET /api/purchase/me` until it reads `confirmed`. No business logic lives here; it only renders what the API says. It can't be framed (`X-Frame-Options` plus CSP `frame-ancestors 'none'`), which is what stops a clickjacked "Buy Now".

**Load balancer + rate limit.** In production, any LB in front of N API instances. Rate limits live in the API (`@fastify/rate-limit`, backed by Redis so counts hold across instances). Purchases are limited per account, so people behind one office NAT don't block each other. Log in, sign up and password reset are limited per IP per minute, against password guessing and reset-mail spam. Status reads stay unlimited: the page polls every 2 seconds.

**API (Fastify).** Stateless. `API_PROCESSES=N` forks N copies sharing the port on one host (Node's cluster module, round robin), the same shape as N containers behind an LB. A copy that crashes while serving is replaced; one that dies before it ever listens (port taken, Redis unreachable at boot) shuts the cluster down with exit code 1, because a replacement would hit the same error and fork-loop. The only thing it does on the purchase hot path is run `purchase.lua` against Redis and, if that reserves a unit, enqueue a job. No database call on this path. See `apps/api/src/routes/purchase.ts`.

**Accounts and sessions.** Users sign up with an email and password (scrypt hash in Mongo). Logging in sets a signed session token (HS256 JWT) in an `httpOnly`, `SameSite=Strict` cookie. On the purchase path the API only verifies that signature, in memory: no database lookup, so auth costs microseconds per purchase. The session's email is the buyer; nothing in the request body can change it. Forgot password stores a hashed, single-use, 30-minute reset token and "sends" the link to an outbox collection, a stand-in for an email provider. See ADR 0009.

**Ops CLI.** `pnpm cli` (`apps/cli`) does everything an operator needs against Redis and Mongo: seed, inject product, clean up one user or all, reset, create and delete accounts, read the outbox, replay the DLQ, reconcile Redis from Mongo. Cleaning up a user goes through `release.lua`, so their unit returns to stock atomically.

**Product display data.** One Mongo document (name, price, photos, specs) written by the seed and served by `GET /api/product` from a 60-second in-process cache with `Cache-Control: public, max-age=60`, so a CDN, the browser, or the API's memory absorbs page-load traffic instead of Mongo. It's deliberately separate from the sale: stock and the window live in Redis, and nothing on the purchase path reads Mongo.

**Redis.** Two jobs, both justified in the ADRs: the atomic purchase gate (window, dedupe, stock) via Lua scripts, and the backing store for the BullMQ queue. One instance, so it's also the one component this design doesn't horizontally scale (see "Known limits" below).

**BullMQ queue + workers.** Decouples "tell the user their unit is reserved" from "write the durable record." A worker calls `confirmOrder`, an upsert keyed on `userId`'s unique index, so processing the same job twice (a retry, a replayed DLQ job) is harmless.

**MongoDB.** The system of record for confirmed orders. One collection, one document shape, one unique index. Queried by the status endpoint and by the stress harness's invariant checks.

**DLQ (BullMQ's failed set).** A job that fails 5 times (exponential backoff) lands here instead of disappearing. `pnpm cli dlq:replay` moves failed jobs back onto the queue once whatever broke (usually Mongo being unreachable) is fixed.

**Fail fast and load shedding.** One app-level hook runs before everything else: while the Redis connection isn't ready it answers 503 without sending a command (the product route is exempt), and while event loop lag is past `MAX_EVENT_LOOP_LAG_MS` it answers 503 with `retry-after: 1`. The API's Redis client gives up after one reconnect attempt and its Mongo client after 2 s, so an outage costs users a quick error instead of a hang. `GET /api/sale` sends `s-maxage=1` so a CDN can collapse polling to one read per second per edge. See ADR 0011.

**Shutdown and diagnostics.** On SIGTERM each process drains through `gracefulShutdown` (core): the API finishes in-flight requests before closing the queue, Redis and Mongo; the worker finishes active jobs (ADR 0012). An opt-in memory tracker lives in `apps/api/src/libs/memory-tracker`: live request objects per route at `GET /debug/memory` (ADR 0013).

## Request walkthrough

1. User clicks "Buy Now." Frontend posts to `POST /api/purchase`; the browser sends the session cookie.
2. API verifies the session signature (401 if missing, forged or expired), takes the email from it as the buyer, and applies the per-user rate limit. If the request carries an `Idempotency-Key`, the API claims it atomically in Redis (`SET NX`, 24 h, scoped to the account): a key it has already answered gets that same answer back, a key still in flight gets 409 `in_progress`. Then it runs `purchase.lua`.
3. Script outcome decides the response:
   - `upcoming` / `ended` → 403, sale isn't open.
   - `already_purchased` → 409, this user already has a unit.
   - `sold_out` → 410, nothing left.
   - `reserved` → unit decremented and buyer recorded, inside the script, atomically.
4. On `reserved`, API enqueues `{ userId, reservedAt }` with `jobId = order-<userId>` (BullMQ rejects bare-integer ids, and a numeric userId is valid), returns `202 pending`. Completed jobs are removed so the same user can be enqueued again in a later sale.
5. If the enqueue itself throws, the API runs `release.lua` to give the unit back and returns `503`, so the user can retry instead of a unit vanishing into nothing.
6. A worker (one of possibly many) picks up the job and upserts the confirmed order into Mongo.
7. The API stores the response under the idempotency key, except a 503, which is worth retrying, so the key is released instead.
8. Frontend, seeing `pending`, polls `GET /api/purchase/me` until the response flips to `confirmed`.

## Scaling this further

Measured, not guessed. 8-core laptop, load generator on the same box, purchase endpoint going through the full Lua path:

| API processes | req/s | p50 |
|---|---|---|
| 1 | 33,700 | 5 ms |
| 2 | 52,700 | 3 ms |
| 4 | 42,300 | 4 ms |

Two processes add 56%. Four is worse than two because the box is out of headroom: Redis was at 424,000 ops/s, roughly 10 Redis operations per purchase (the rate limiter's counter script plus the reads inside `purchase.lua`, both counted), while sharing cores with four API processes and the load generator.

- **API and worker**: stateless, scale by running more of them. BullMQ hands each job to exactly one worker; two workers split 2,101 jobs 1,067 / 1,034 in the last stress run.
- **Redis**: the shared point. Levers, cheapest first: (1) move rate limiting to the load balancer or an API gateway, which removes about half the Redis work per purchase; (2) give Redis its own host so it isn't fighting the API for CPU; (3) Redis Cluster. The gate's three keys (`sale:config`, `sale:stock`, `sale:buyers`) are one sale, so they'd go in one hash slot via a `{sale}` hash tag; more throughput beyond one shard means splitting stock into N buckets, each its own slot, and routing each user to one bucket by hash. Dedupe still holds (a user always lands in the same bucket); the cost is fairness, since one bucket can sell out while another still has units.
- **Mongo**: writes are paced by worker concurrency, not by request volume, so this rarely becomes the bottleneck first. One collection keyed by `userId`, which shards cleanly.

## Known limits

Documented instead of hidden, matching PRD section 8:

- Redis runs with AOF (`appendfsync everysec`). A hard crash can lose up to ~1 second of reservations that hadn't yet reached the queue. `pnpm cli reconcile` rebuilds `sale:buyers`/`sale:stock` from Mongo's confirmed orders plus every unconfirmed job still in Redis, DLQ included (a DLQ job will confirm an order when replayed, so its user keeps their unit), but it can't recover a reservation that never reached either store, and it can't recover the sale's start/end/stock numbers if `sale:config` itself was lost (re-seeding with the original values is the only recovery there).
- Single Redis instance is a single point of failure for the entire purchase path. Acceptable for this exercise's scope; called out as the first thing to change for a real production deployment.
