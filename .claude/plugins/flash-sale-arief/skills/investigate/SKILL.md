---
name: investigate
description: Use when something is wrong in the flash sale (suspected oversell or duplicate order, a purchase stuck on "pending", unexpected 403/409/410/429/503, slow purchases, memory growth) and the cause isn't known yet. Gathers evidence first, states one hypothesis, proves it with a failing test, then fixes.
---

# Investigate

Evidence before theories. Read only until the cause is proven.

## 1. Pin the symptom

Write down, in one or two lines: what was expected, what happened, for which account, when, and how often. Get the exact status code and body (`curl -si`), not a paraphrase.

## 2. Look at the state (read only)

Use the `read-database` skill. The usual first five:

```bash
pnpm cli status                                   # window, stock, buyers, orders, queue
redis-cli HGETALL sale:config; redis-cli GET sale:stock; redis-cli SCARD sale:buyers
redis-cli SISMEMBER sale:buyers <email>
redis-cli ZCARD bull:orders:failed                # the DLQ
node .claude/skills/read-database/query.mjs orders '{"userId":"<email>"}'
```

Check the invariant: `SCARD sale:buyers + GET sale:stock == totalStock`, and confirmed orders `<=` buyers. Any gap is the story.

## 3. Match the symptom to the usual suspects

| Symptom | First place to look |
|---|---|
| Every purchase 403 | Window ended: `.env` `SALE_START/SALE_END` are stale. Re-seed |
| "pending" forever | Worker not running, or the job is in the DLQ (`pnpm cli dlq:replay` after fixing the cause) |
| Buyer in Redis, no order in Mongo | Enqueue lost, or a lost reply re-sent the script (REPOSITORY_ANALYSIS risk 3). `pnpm cli reconcile` repairs; find out which first |
| 503 bursts | Redis/Mongo reachability (`/health`), or load shedding (event loop lag past `MAX_EVENT_LOOP_LAG_MS`) |
| 429 | Rate limit doing its job: purchases per account per second, auth per IP per minute |
| Event loop stalls | Run with `FREEZE_PROFILER=1` and open the `.cpuprofile` (apps/api/src/libs/freeze-profiler) |
| Memory climbing | Run with `MEMORY_TRACKER=1`, compare `GET /debug/memory` before and after load |

## 4. Trace the code path

`codegraph impact <symbol>` / `codegraph callers <symbol>` (the `codegraph` skill), then read the files it names. For the purchase path: `apps/api/src/routes/purchase.ts` then `packages/core/src/lua-scripts.ts`.

## 5. One hypothesis, then prove it

State it in one sentence ("X happens because Y when Z"). Write the smallest test that fails because of it (integration test against real Redis/Mongo for anything touching the gate). If it doesn't fail, the hypothesis is wrong: go back to step 2, don't patch around it.

## 6. Fix and verify

Smallest fix that makes the test pass without breaking an invariant in `CLAUDE.md`. Then run the `verify-and-log` skill.

## Report

Symptom, evidence (commands and output), cause, the failing test, the fix, and what you didn't verify. Never run destructive `pnpm cli` commands (`reset`, `users:clean`, `reconcile`) without the user saying so.
