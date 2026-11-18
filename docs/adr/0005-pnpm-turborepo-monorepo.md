# ADR 0005: pnpm workspaces + Turborepo for the monorepo

Status: Accepted
Date: 2026-11-18

## Context

The system has four runnable pieces (API, worker, frontend, stress harness) that share domain logic: the Lua scripts, the Redis/Mongo connection helpers, the order schema, the job shape. Duplicating that across separate repos (or copy-pasting it between folders) would let the API and worker drift apart on exactly the logic that has to stay identical, like what a "confirmed order" or a "reservation" means.

## Decision

One repo, pnpm workspaces for installs and linking, Turborepo for running `build`/`test`/`typecheck` in dependency order with caching. The shared pieces live in `packages/core` and are imported by `apps/api`, `apps/worker`, and `stress/` as `@flashsale/core`.

## Consequences

- `packages/core` is built once (`pnpm build`) before its consumers can typecheck or run; `turbo.json` encodes that with `dependsOn: ["^build"]`, so `pnpm build` always does it in the right order.
- Caught directly during this build: forgetting to rebuild `core` after changing it makes a consumer's typecheck fail against the stale compiled `dist/`. Turborepo's dependency graph is what prevents that in a normal `pnpm build && pnpm test` run; it only bit when core was rebuilt by hand out of band.
- Four small packages instead of one big app. Each one has a narrow job: API does HTTP, worker does queue consumption, web does the UI, core does the domain rules neither app should duplicate.
