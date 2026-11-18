# AGENTS.md

Instructions for any coding agent (Codex, Cursor, Copilot, Claude Code, others). Claude Code also reads `CLAUDE.md`, which is the source of truth for the invariants below; if the two ever disagree, `CLAUDE.md` wins and this file gets fixed.

## What this is

A flash sale for one product: a sale window, fixed stock, one unit per account. Fastify API, BullMQ worker, React storefront, Redis for the purchase gate, MongoDB for the durable record. pnpm + Turborepo monorepo.

## Setup

```bash
docker compose up -d              # Redis + MongoDB
cp .env.example .env
pnpm install && pnpm build        # core builds first; apps import its dist/
pnpm cli seed                     # product, sale window, demo account demo@example.com / FlashSale2026!
pnpm dev                          # API :3000 (Swagger UI /docs), worker, web :5173
```

## Checks (run before saying you're done)

```bash
pnpm typecheck && pnpm lint
pnpm test                         # unit + property tests, docs spec drift
pnpm test:integration             # real Redis + Mongo
pnpm test:mutation                # touched core, api, worker or cli: must stay 100%
pnpm test:e2e                     # touched web or auth; needs AUTH_RATE_LIMIT_MAX=1000 pnpm dev running
pnpm test:python                  # API contract from outside; needs a running API and .venv (see tests/python)
pnpm test:postman                 # Postman collection via newman; needs a running API
```

## Rules that break the system if ignored

1. The purchase decision is one atomic Lua script (`packages/core/src/lua-scripts.ts`). Never split it into separate Redis calls.
2. `POST /api/purchase` touches Redis only: no Mongo, no user lookup.
3. The buyer is the email in the signed session, never anything in the request body.
4. Order writes are an upsert on the unique `userId` index. Job ids come from `orderJobId(userId)`.
5. A reservation that fails to enqueue is released.
6. The API stays stateless; shared state lives in Redis.
7. Status codes are a contract: change `apps/api/openapi.yaml`, its copy in `apps/docs/api-reference/`, the README API table and `apps/web/src/api.ts` together.
8. Load shedding answers before the gate; no `commandTimeout` on the API's Redis client.
9. Every process closes what it opens on SIGTERM (`gracefulShutdown` in core).
10. Diagnostics (freeze profiler, memory tracker, AI explanation) stay off unless their env var is set.

Full list with reasons: `CLAUDE.md`, "Invariants". Decisions: `docs/adr/`.

## Where things are

| Path | Owns |
|---|---|
| `packages/core` | Rules: Lua gate, keys, orders, users, sessions, reset tokens |
| `apps/api` | HTTP, rate limits, load shedding, OpenAPI spec |
| `apps/worker` | Queue consumer, order confirmation |
| `apps/cli` | Ops commands (`pnpm cli --help`) |
| `apps/web` | React storefront |
| `apps/docs` | Mintlify site (`pnpm docs`) |
| `stress/` | Load harness with invariant checks. Destructive to dev data |
| `tests/python` | Black-box contract tests (pytest) |

Each package has its own `CLAUDE.md` with local details. Task how-tos live in `.claude/skills/*/SKILL.md` (ADRs, API changes, reading the databases, CodeGraph, style, git, stack); they are plain Markdown and work for any agent.

## Style

- Smallest diff that's correct. No speculative options, helpers or config.
- Comments say why. Stryker and ESLint disables carry a reason.
- No em dashes in code, docs or commits. Plain, concrete prose.
- Never commit `docs/brief.md`, `.env`, `.codegraph/`, or anything with a real secret. Commit and push only when asked.

## Parallel work

Use a git worktree per agent and your own Redis/Mongo (`REDIS_PORT=16379 MONGO_PORT=17017 docker compose -p flashsale-<name> up -d`, then `TEST_REDIS_URL=redis://localhost:16379 TEST_MONGO_URL=mongodb://localhost:17017`). E2E and stress use fixed ports and the dev databases: one agent at a time. Details in `CLAUDE.md`, "Working in parallel".
