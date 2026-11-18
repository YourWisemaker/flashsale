# Performance review

What the purchase path costs, what we measured, how to reproduce it, and which knob to turn next. Every number here comes from a real run on an 8-core laptop (Node 24, local Redis 7 and MongoDB 8, load generator on the same machine).

## The hot path

`POST /api/purchase` does this and nothing else:

1. Load-shedding hook: read the ioredis connection state and the last event loop lag sample. Both in memory.
2. Verify the session JWT signature (HS256, in memory). No database.
3. Per-account rate limit: one Redis script call.
4. Optional `Idempotency-Key` claim: one `SET NX`.
5. `purchase.lua`: window, dedupe, stock check, decrement, record buyer. One Redis round trip.
6. On a win, `queue.add` with a fixed job id: one BullMQ round trip.

No MongoDB call. Roughly 10 Redis operations per purchase, counting the commands inside the rate limiter's and the gate's scripts. The order write happens later, in a worker, paced by `WORKER_CONCURRENCY` instead of by traffic.

## Measured

### Correctness under load (`pnpm stress`)

2 API processes, 2 workers (`WORKER_CONCURRENCY=25`), shedding on at the 200 ms default. Run on 2026-11-18:

| Scenario | Requests | Throughput | p50 | p95 | p99 | Result |
|---|---|---|---|---|---|---|
| A: 10,000 users, 100 units | 10,000 | 16,393 req/s | 14 ms | 52 ms | 77 ms | 100 pending, 9,900 sold_out |
| B: 1 user, 1,000 concurrent | 1,000 | 18,182 req/s | 13 ms | 17 ms | 19 ms | 1 pending, 999 already_purchased |
| C: 5,000 users x 3, 2,000 units | 15,000 | 18,844 req/s | 14 ms | 29 ms | 34 ms | 2,000 / 4,000 / 9,000 |

Every invariant passed: exact confirmed counts, no duplicate winners, stock never negative, Redis and Mongo agree. Zero requests were shed. The earlier run (before load shedding) got 14,006 to 18,450 req/s with p99 115 ms at worst; full output in [`stress/README.md`](stress/README.md).

These numbers are capped by the client: the harness is one Node process with a fetch pool (about 12k to 19k req/s). It exists to check invariants, not to find the server's ceiling.

### Raw server throughput (autocannon)

Purchase endpoint, full Lua path, multi-worker autocannon:

| API processes | req/s | p50 |
|---|---|---|
| 1 | 33,700 | 5 ms |
| 2 | 52,700 | 3 ms |
| 4 | 42,300 | 4 ms |

Four is slower than two because the box ran out of cores: Redis hit 424,000 ops/s while sharing the CPU with four API processes and the load generator.

### Failure paths

| Situation | Before | After (ADR 0011) |
|---|---|---|
| Redis down | requests hang through 20 ioredis retries | 503 in under 500 ms (integration test asserts it) |
| Mongo down | 30 s server selection | 503 within 2 s on API routes that read Mongo |
| Process saturated | every request gets slower | 503 + `retry-after: 1` past 200 ms event loop lag |
| Product page load | one Mongo read per visitor | one read per process per 60 s |
| Status polling via a CDN | one Redis read per poll | one per second per edge (`s-maxage=1`) |

## Reproduce

```bash
pnpm build
API_PROCESSES=2 RATE_LIMIT_MAX=100000 pnpm --filter @flashsale/api start
WORKER_CONCURRENCY=25 pnpm --filter @flashsale/worker start    # two terminals
pnpm stress
```

`RATE_LIMIT_MAX` is opened up because scenario B is one account firing 1,000 requests at once. The stress run wipes orders and reseeds the sale in whatever `REDIS_URL` / `MONGO_URL` point at: dev databases only. Run `pnpm cli seed --force` afterwards.

For raw throughput, seed an active sale and point `npx autocannon` at `POST /api/purchase` with a session cookie and a high `RATE_LIMIT_MAX`.

## Knobs

| Env var | Default | Turn it when |
|---|---|---|
| `API_PROCESSES` | 1 | CPU-bound API on a multi-core host. 2 was the sweet spot on 8 cores with Redis local |
| `WORKER_CONCURRENCY` | 10 | Queue backlog after a sale; bounded by what Mongo writes comfortably |
| `RATE_LIMIT_MAX` | 5 | Purchases per account per second. 2 or 3 is a tighter anti-bot setting |
| `MAX_EVENT_LOOP_LAG_MS` | 200 | Lower to shed earlier; 0 turns shedding off |

## Next levers, cheapest first

1. **Rate limit at the load balancer or gateway.** Removes about half the Redis work per purchase.
2. **Redis on its own host.** It was competing with the API for CPU in every run above.
3. **Read replicas for status reads**, or a CDN in front of `GET /api/sale` (the header is already there).
4. **Redis Cluster.** The three sale keys go in one slot via a `{sale}` hash tag. Past one shard, split stock into N buckets and route users by hash; dedupe still holds, at a small fairness cost.

Mongo is rarely first to saturate: writes are paced by worker concurrency, and the one collection is keyed by `userId`, which shards cleanly.
