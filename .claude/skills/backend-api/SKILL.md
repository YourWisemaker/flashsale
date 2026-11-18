---
name: backend-api
description: Add or change an HTTP endpoint, status code, response body, header, or hook in apps/api (Fastify). Covers the route, OpenAPI spec, docs site, frontend contract, and the tests that must change with it.
---

# Changing the API

Read `apps/api/CLAUDE.md` and the invariants in the root `CLAUDE.md` first. Status codes are a contract.

## Where things go

| Change | File |
|---|---|
| New route | `apps/api/src/routes/<area>.ts`, a `registerXRoute(app, deps)` function taking only the deps it uses |
| Wire it | `apps/api/src/app.ts`, `buildApp` calls the register function. Dependencies come in through `AppDeps`, never imported side effects |
| Business rule | `packages/core`, not the route. Routes map results to HTTP |
| Purchase outcome to HTTP | `apps/api/src/purchase-response.ts` (a table; add a row) |
| App-wide hook | `app.addHook` in `buildApp` or its own module like `load-shedding.ts` |
| Env var | `config.ts` (pure, tested), `.env.example`, README config table, `turbo.json` `globalPassThroughEnv` |

## Checklist for every endpoint change

1. Route code plus an integration test in `apps/api/src/__tests__/integration/` using `ctx.makeApp()` / `ctx.as(email)`.
2. `apps/api/openapi.yaml`: path, method, every status code, an example per body. Quote any inline `{ }` value containing a comma.
3. `cp apps/api/openapi.yaml apps/docs/api-reference/openapi.yaml` (`pnpm test` fails on drift).
4. README API table.
5. If the web app calls it: `apps/web/src/api.ts`, `messages.ts`, and their tests.
6. Needs Redis? The load-shedding hook already returns 503 while Redis is down. Doesn't need Redis? Add it to the exemption in `load-shedding.ts`.
7. Writes or user input: rate limit it (`app.rateLimit(...)` in `onRequest`), validate at the boundary, and never take the buyer from the body.

## Verify

```bash
pnpm --filter @flashsale/api typecheck
pnpm --filter @flashsale/api test
pnpm --filter @flashsale/api test:integration   # includes openapi.test.ts: every served route must be in the spec
pnpm --filter @flashsale/api test:mutation      # keep it at 100%
pnpm lint
```

Hot path rule: `POST /api/purchase` touches Redis only. No Mongo, no user lookup, no new await before the gate unless it's in-memory.
