# CLAUDE.md

Flash sale backend: one product, fixed stock, a sale window, one unit per user, built to survive a traffic spike without overselling. pnpm + Turborepo monorepo.

Read before changing the purchase flow: `docs/architecture.md` (diagram, request walkthrough, scaling numbers), then the ADR for the area (`docs/adr/`). Each package also has its own `CLAUDE.md` with local rules; Claude Code loads it when you work in that directory.

## Map

| Path | Owns | Package CLAUDE.md |
|---|---|---|
| `packages/core` | The rules: Lua purchase gate, Redis keys, job options, order persistence, userId normalization. Shared by everything else. | yes |
| `apps/api` | HTTP: Fastify routes, rate limit, cluster entry point, seed script | yes |
| `apps/worker` | Queue consumer that confirms orders into Mongo; `dlq-replay` and `reconcile` ops scripts | yes |
| `apps/web` | React UI, Vitest component tests, Playwright e2e | yes |
| `stress/` | Load harness plus invariant checks against Redis/Mongo. Destructive. | yes |
| `docs/` | PRD, architecture, ADRs | no |

## Commands

```bash
docker compose up -d          # Redis + Mongo (or local redis-server / mongod)
pnpm install && pnpm build    # build core first; apps import its compiled dist/
pnpm seed                     # write sale window + stock (add `-- --force` via --filter to overwrite)
pnpm dev                      # api + worker + web, watch mode

pnpm typecheck
pnpm test                     # unit + property-based (core, api, worker, web). Needs Redis + Mongo.
pnpm test:integration         # api + worker against real Redis + Mongo
pnpm test:mutation            # Stryker on core, api, worker. ~1 min. Break threshold 75, currently 100.
pnpm test:e2e                 # Playwright. Needs `pnpm dev` running.
pnpm stress                   # Needs api (RATE_LIMIT_MAX raised) + worker running. Wipes orders. See stress/README.md.
pnpm --filter @flashsale/<core|api|worker|web|stress> run <script>
```

After changing `packages/core`, rebuild it (`pnpm --filter @flashsale/core build`) before running anything that imports it. Consumers read the compiled `dist/`, so a stale build typechecks and runs against old code.

## Invariants: don't break these

1. **The purchase decision is one atomic Lua script** (`packages/core/src/lua-scripts.ts`): window check, dedupe, stock check, decrement, record buyer. Never split it into separate Redis calls from TypeScript. ADR 0001.
2. **No database call on the purchase hot path.** `POST /api/purchase` touches Redis only. Mongo writes happen in the worker. ADR 0002.
3. **Every userId goes through `normalizeUserId`** at the boundary before touching Redis or Mongo.
4. **`confirmOrder` stays an upsert on the unique `userId` index**, safe to run twice.
5. **A reservation that fails to enqueue is released** (`release.lua`), never left holding a unit.
6. **Job ids come from `orderJobId(userId)`**, never the bare userId (BullMQ rejects integer-like ids). Completed jobs are removed, failed jobs kept (the DLQ). ADR 0003.
7. **The API stays stateless.** Anything shared between requests lives in Redis, or `API_PROCESSES` and multi-host scaling break. A cluster child that fails at startup must stop the cluster, never fork-loop. ADR 0007.
8. **Rate limiting covers `POST /api/purchase` only.**
9. **Status codes are a contract** with the frontend and the docs (README API table). Changing one means changing `apps/web/src/api.ts` and its tests in the same change.

## Testing rules

- Real Redis and Mongo, no fakes. The Lua scripts only mean something inside real Redis.
- Whoever changes behavior adds or updates the test in the same change. If mutation score drops below 100 on a package you touched, look at the survivors before calling it done.
- Each package's tests use their own Redis db index and Mongo database (see each `test-helpers.ts` and the core tests). Keep it that way when adding suites; that's what lets packages run in parallel.
- Build objects under test inside `beforeEach`/the test, not at module load. Stryker can't see mutants in code that ran at import.
- Don't put the only call of something under test in a `beforeAll`: if it throws, Vitest skips the tests instead of failing them (`packages/core/src/__tests__/mongo.test.ts` exists for this reason).

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
- `pnpm dev`, `pnpm test:e2e`, and `pnpm stress` bind ports 3000/5173 and wipe dev data. Only one agent runs those at a time; set `PORT` / `STRESS_API_URL` / `REDIS_URL` / `MONGO_URL` to move a second stack.
- Stop what you start, by port: `lsof -ti:3000,5173 | xargs kill`. Don't use `pkill -f 'a\|b'`; `pkill` doesn't do `\|` alternation and silently matches nothing.

Specialized subagents for this repo live in `.claude/agents/` (one per package plus a read-only verifier). Fan out by package, then run `verifier` last.

## Definition of done

- `pnpm typecheck && pnpm test && pnpm test:integration` green
- `pnpm test:mutation` still 100 on any package you changed, or survivors explained
- If you touched the purchase path: `pnpm stress` passes. If you touched the UI: `pnpm test:e2e` passes.
- Docs updated where they state a number, a command, or a status code you changed (README, architecture, stress/README, ADRs)

## Gotchas

- `.env` holds concrete `SALE_START`/`SALE_END` timestamps that go stale. An ended window makes every purchase a cheap 403, which looks like great throughput and isn't. Re-seed: `pnpm --filter @flashsale/api run seed -- --force`.
- The rate limiter defaults to 5 purchases/s per IP. Raise `RATE_LIMIT_MAX` for stress runs or you'll measure 429s.
- Turbo runs tasks in strict env mode: a new env var a task reads must be added to `globalPassThroughEnv` in `turbo.json`, or it silently isn't there.
- A crashed Stryker run can leave `.stryker-tmp/` behind. It's gitignored and excluded from Vitest; delete it if it appears.
- `docs/brief.md` is the confidential assessment brief. It's gitignored on purpose; never commit it or quote it in tracked files.

## Writing style (code comments, docs, commits)

No em dashes. Plain sentences. Name the file, endpoint, or number. Comments explain why, not what the line already says.
