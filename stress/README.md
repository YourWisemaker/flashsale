# Stress tests

Proves two things under real concurrency, against the real HTTP API, the real Redis gate, and the real worker/Mongo pipeline: nobody oversells, and nobody buys twice.

**Destructive.** Each scenario wipes the `orders` collection and overwrites the sale window/stock in whatever `REDIS_URL` / `MONGO_URL` point at (dev defaults if unset). Don't run this against anything other than a local dev or test database.

## Why not autocannon

The PRD originally called for autocannon. Switched to a ~60-line script using Node's built-in `fetch` and a small concurrency pool (`src/concurrency-pool.ts`) instead, because this test needs a **unique, known userId on every request** to check "did user X win exactly once" after the run. That's awkward to get out of autocannon's request templating, and trivial with a plain array of tasks. No new dependency, full control over what each request sends and what comes back.

autocannon is still the right tool for raw throughput, where per-request identity doesn't matter. The scaling numbers in the root README come from a one-off `npx autocannon` run, not from this harness.

## What it runs

Three scenarios, run back to back against the same live API:

| Scenario | Setup | Proves |
|---|---|---|
| A | 10,000 unique users, 100 units of stock | no overselling under a heavy race |
| B | 1 user, 1,000 concurrent purchase attempts | one-per-user holds even against itself |
| C | 5,000 users, each firing 3 attempts (double/triple-click), 2,000 units | both rules at once, stock running out mid-flight |

Purchases need a session, so each virtual user gets a signed session cookie up front (minted with the same `AUTH_SECRET` as the API), as if they'd logged in before the sale opened. That's what real flash-sale traffic looks like, and it keeps this measuring the purchase path rather than password hashing.

Each scenario reseeds the sale, fires all its requests at a configurable concurrency (default 300 in-flight requests), waits for the queue to fully drain, then asserts against Redis and Mongo directly:

1. confirmed orders == `min(totalStock, uniqueUsers)` (no overselling)
2. zero duplicate `userId` among confirmed orders (no double-buying)
3. `sale:stock` never went negative
4. `sale:stock` matches `totalStock - confirmed orders` (Redis and Mongo agree)

Any failed check fails the run (non-zero exit code).

## How to run it

1. Infra up: `docker compose up -d` (or local `redis-server` / `mongod`), then `pnpm build`.
2. Start the API **with the purchase rate limit opened up**. It defaults to 5 purchases/s per account, and scenario B is one account firing 1,000 requests at once, so otherwise this is a wall of 429s instead of a real test:
   ```
   API_PROCESSES=2 RATE_LIMIT_MAX=100000 pnpm --filter @flashsale/api start
   ```
3. Start two workers (two terminals), so the run also shows jobs split across consumers:
   ```
   WORKER_CONCURRENCY=25 pnpm --filter @flashsale/worker start
   ```
4. Run it: `pnpm stress`

`pnpm --filter @flashsale/api run dev` (one process, watch mode) works too; the invariants are the same, it's just one core.

Tunables (env vars): `STRESS_API_URL` (default `http://localhost:3000`), `STRESS_CONCURRENCY` (default 300 in-flight requests).

## Actual result

2 API processes, 2 worker processes, authenticated virtual users, local Redis + Mongo, Node 24, 8-core laptop, load generator on the same machine:

```
=== A: 10,000 unique users racing for 100 units ===
requests: 10000 in 714ms (14006 req/s)
latency ms: p50=16 p95=61 p99=115 max=126
status counts: { pending: 100, sold_out: 9900 }
  [PASS] no overselling: confirmed orders = 100, expected min(stock, unique users) = 100
  [PASS] no duplicate winners: 100 confirmed orders, 100 distinct userIds
  [PASS] stock never negative: sale:stock = 0
  [PASS] redis stock matches mongo confirmations: sale:stock = 0, totalStock - confirmed = 0
=== B: 1 user firing 1,000 concurrent purchase attempts ===
requests: 1000 in 69ms (14493 req/s)
latency ms: p50=16 p95=34 p99=35 max=35
status counts: { already_purchased: 999, pending: 1 }
  [PASS] no overselling: confirmed orders = 1, expected min(stock, unique users) = 1
  [PASS] no duplicate winners: 1 confirmed orders, 1 distinct userIds
  [PASS] stock never negative: sale:stock = 49
  [PASS] redis stock matches mongo confirmations: sale:stock = 49, totalStock - confirmed = 49
=== C: 5,000 users each retrying 3x against 2,000 units ===
requests: 15000 in 813ms (18450 req/s)
latency ms: p50=15 p95=26 p99=34 max=44
status counts: { pending: 2000, already_purchased: 4000, sold_out: 9000 }
  [PASS] no overselling: confirmed orders = 2000, expected min(stock, unique users) = 2000
  [PASS] no duplicate winners: 2000 confirmed orders, 2000 distinct userIds
  [PASS] stock never negative: sale:stock = 0
  [PASS] redis stock matches mongo confirmations: sale:stock = 0, totalStock - confirmed = 0
=== Summary ===
  [PASS] A: 10,000 unique users racing for 100 units
  [PASS] B: 1 user firing 1,000 concurrent purchase attempts
  [PASS] C: 5,000 users each retrying 3x against 2,000 units
```

Jobs per worker process in that run: 1,043 and 1,058 (2,101 total = 100 + 1 + 2,000).

## Reading the numbers

- **~14-18k req/s** on a laptop (up from 11-13k before accounts: purchase requests no longer carry a JSON body to parse), against the real Fastify + Redis stack, including the Lua round trip and the enqueue. The bottleneck here is this client (one Node process firing fetches), not the server: a multi-worker autocannon run against the same endpoint reached 52,700 req/s with 2 API processes. See "Scaling" in the root README.
- **p99 115 ms at worst, with 10,000 racers** (scenario A). That request did real work: window check, dedupe check, stock check, decrement, enqueue.
- **Scenario C is the interesting one**: 15,000 requests: 2,000 "pending" (one per winner), 4,000 "already_purchased" (each winner's 2nd and 3rd click, 2,000 × 2), 9,000 "sold_out" (every click from the 3,000 users who lost, 3,000 × 3). The numbers add up exactly, and there are exactly 2,000 confirmed orders afterward. That's the atomic Lua script holding up under the exact failure pattern a real flash sale produces: the same people clicking "Buy" repeatedly while stock is disappearing under them.
- **Why invariant checks and not just req/s**: a system can be "fast" and still oversell under a bad race. The pass/fail here is the correctness proof; the req/s number is a side effect of how cheap the hot path is.
