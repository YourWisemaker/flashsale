# CLAUDE.md

Arief Shop: a flash sale for one product, fixed stock, a sale window, one unit per account, built to survive a traffic spike without overselling. Accounts (sign up, log in, forgot/reset password), a storefront, and an ops CLI around it. pnpm + Turborepo monorepo.

Read before changing the purchase flow: `docs/architecture.md` (diagram, request walkthrough, scaling numbers), then the ADR for the area (`docs/adr/`). Each package also has its own `CLAUDE.md` with local rules; Claude Code loads it when you work in that directory.

## Map

| Path | Owns | Package CLAUDE.md |
|---|---|---|
| `packages/core` | The rules: Lua purchase gate, Redis keys, job options, orders, product, users, sessions, reset tokens, outbox. Shared by everything else. | yes |
| `apps/api` | HTTP: Fastify routes (sale, purchase, auth, product), rate limits, security headers, cluster entry point | yes |
| `apps/worker` | Queue consumer that confirms orders into Mongo | yes |
| `apps/cli` | `pnpm cli`: seed, clean up, accounts, outbox, DLQ replay, reconcile | yes |
| `apps/web` | React storefront and account pages, Vitest component tests, Playwright e2e | yes |
| `stress/` | Load harness plus invariant checks against Redis/Mongo. Destructive. | yes |
| `docs/` | PRD, architecture, ADRs | no |

## Commands

```bash
docker compose up -d          # Redis + Mongo (or local redis-server / mongod)
pnpm install && pnpm build    # build core first; apps import its compiled dist/
pnpm cli seed                 # indexes, product, sale window, demo account (demo@example.com / FlashSale2026!)
pnpm cli                      # interactive ops menu; pnpm cli --help for every command
pnpm dev                      # api + worker + web, watch mode

pnpm typecheck
pnpm test                     # unit + property-based (core, api, worker, cli, web). Needs Redis + Mongo.
pnpm test:integration         # api, worker, cli against real Redis + Mongo
pnpm test:mutation            # Stryker on core, api, worker, cli. A few minutes. Break threshold 75, currently 100.
pnpm test:e2e                 # Playwright. Needs `AUTH_RATE_LIMIT_MAX=1000 pnpm dev` running.
pnpm stress                   # Needs api (RATE_LIMIT_MAX raised) + worker running. Wipes orders. See stress/README.md.
pnpm --filter @flashsale/<core|api|worker|cli|web|stress> run <script>
```

After changing `packages/core`, rebuild it (`pnpm --filter @flashsale/core build`) before running anything that imports it. Consumers read the compiled `dist/`, so a stale build typechecks and runs against old code.

## Invariants: don't break these

1. **The purchase decision is one atomic Lua script** (`packages/core/src/lua-scripts.ts`): window check, dedupe, stock check, decrement, record buyer. Never split it into separate Redis calls from TypeScript. ADR 0001.
2. **No database call on the purchase hot path.** `POST /api/purchase` touches Redis only. Mongo writes happen in the worker. ADR 0002.
3. **The buyer is the email in the signed session, never anything in the request body.** Emails are normalized (`normalizeEmail`) when an account is created, so the session already carries the canonical id. Don't add a route that takes a user id from the client.
4. **`confirmOrder` stays an upsert on the unique `userId` index**, safe to run twice.
5. **A reservation that fails to enqueue is released** (`release.lua`), never left holding a unit.
6. **Job ids come from `orderJobId(userId)`**, never the bare userId (BullMQ rejects integer-like ids). Completed jobs are removed, failed jobs kept (the DLQ). ADR 0003.
7. **The API stays stateless.** Anything shared between requests lives in Redis, or `API_PROCESSES` and multi-host scaling break. A cluster child that fails at startup must stop the cluster, never fork-loop. ADR 0007.
8. **Rate limits:** purchases per account; log in, sign up, forgot and reset per IP per minute. Status reads stay unlimited.
9. **Auth stays off the database on the hot path:** the purchase route verifies the session signature in memory. Don't add a user lookup there. Passwords only as scrypt hashes; reset tokens only as SHA-256 hashes; login and forgot give the same answer whether or not an account exists. ADR 0009.
10. **Status codes are a contract** with the frontend and the docs (README API table). Changing one means changing `apps/web/src/api.ts` and its tests in the same change.
11. **Idempotency-Key on purchase:** claimed with `SET NX` before the gate runs, answer saved after, released only on 503. Never run the gate when the claim fails (answer 503). ADR 0010.

## Testing rules

- Real Redis and Mongo, no fakes. The Lua scripts only mean something inside real Redis.
- Whoever changes behavior adds or updates the test in the same change. If mutation score drops below 100 on a package you touched, look at the survivors before calling it done.
- Each package's tests use their own Redis db index and Mongo database (core 15 and 11, api 14, worker 13, cli 10; Mongo `flashsale_test*`). Keep it that way when adding suites; that's what lets packages run in parallel.
- Build objects under test inside `beforeEach`/the test, not at module load. Stryker can't see mutants in code that ran at import.
- Don't put setup that the code under test depends on in a `beforeAll`: if it throws, Vitest skips the tests instead of failing them, and mutation testing reports the bug as surviving. Use `beforeEach` or do it inside the test.

## Working in parallel (several agents at once)

Ownership is by package. One agent per package is safe; two agents in the same package should split by file and say so up front.

**Shared contracts.** Changing any of these affects other packages, so do it in one change that updates every consumer, or hand it to a single agent:
- `packages/core/src/index.ts` exports, `keys.ts` (key names, `ORDER_JOB_OPTIONS`, `orderJobId`), `types.ts`, `OrderJobData` in `orders.ts`
- the Lua scripts
- HTTP status codes and response bodies (api ↔ web)
- env var names (`.env.example`, `turbo.json` `globalPassThroughEnv`, docs)

**Isolation, so test runs don't trample each other:**
- Use a git worktree per agent (`git worktree add ../flashsale-<name> -b <branch>`), or the Agent tool's `isolation: "worktree"`.
- Unit, property, and integration suites in different packages can share one Redis/Mongo: each package uses its own db index and database name.
- The same package's suite, run by two agents at once against the same Redis/Mongo, will collide. Give the second agent its own infra:
  ```bash
  REDIS_PORT=16379 MONGO_PORT=17017 docker compose -p flashsale-<name> up -d
  TEST_REDIS_URL=redis://localhost:16379 TEST_MONGO_URL=mongodb://localhost:17017 pnpm test
  ```
- `pnpm dev`, `pnpm test:e2e`, `pnpm stress`, and destructive `pnpm cli` commands bind ports 3000/5173 and/or wipe dev data. Only one agent runs those at a time; set `PORT` / `STRESS_API_URL` / `REDIS_URL` / `MONGO_URL` to move a second stack.
- Stop what you start, by port: `lsof -ti:3000,5173 | xargs kill`. Don't use `pkill -f 'a\|b'`; `pkill` doesn't do `\|` alternation and silently matches nothing.

Specialized subagents for this repo live in `.claude/agents/` (core-gate, api-engineer, worker-engineer, cli-engineer, web-engineer, plus a read-only verifier). Fan out by package, then run `verifier` last.

## Definition of done

- `pnpm typecheck && pnpm test && pnpm test:integration` green
- `pnpm test:mutation` still 100 on any package you changed, or survivors explained
- If you touched the purchase path: `pnpm stress` passes. If you touched the UI: `pnpm test:e2e` passes.
- Docs updated where they state a number, a command, or a status code you changed (README, architecture, stress/README, ADRs)

## Gotchas

- `.env` holds concrete `SALE_START`/`SALE_END` timestamps that go stale. An ended window makes every purchase a cheap 403, which looks like great throughput and isn't. Re-seed: `pnpm cli seed --force --start now --minutes 60`.
- Purchases default to 5/s per account and auth to 10/min per IP. Raise `RATE_LIMIT_MAX` for stress runs and `AUTH_RATE_LIMIT_MAX` for e2e, or you'll measure 429s. The limiter's counters live in Redis, so they survive an API restart; wait out the window.
- Turbo runs tasks in strict env mode: a new env var a task reads must be added to `globalPassThroughEnv` in `turbo.json`, or it silently isn't there.
- A crashed Stryker run can leave `.stryker-tmp/` behind. It's gitignored and excluded from Vitest; delete it if it appears.
- `docs/brief.md` is the confidential assessment brief. It's gitignored on purpose; never commit it or quote it in tracked files.

## Writing style (code comments, docs, commits)

No em dashes. Plain sentences. Name the file, endpoint, or number. Comments explain why, not what the line already says.
