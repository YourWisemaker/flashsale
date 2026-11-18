---
name: global-typescript
description: TypeScript conventions for every package in this repo (ESM, strict mode, imports, types, errors). Use whenever writing or reviewing .ts or .tsx here.
---

# TypeScript here

- **ESM everywhere.** Relative imports end in `.js` even from `.ts` (`import { x } from "./keys.js"`). Node resolves the compiled file.
- **Strict mode is on.** No `any`; use `unknown` and narrow. No `!` non-null assertions to quiet the compiler: handle the null.
- **Import shapes that bit us:** `import { Redis } from "ioredis"` (named, not default). Type-only imports use `import type` or inline `type`.
- **Shared types live in `@flashsale/core`.** Apps import them from there; don't redeclare `SaleSnapshot`, `OrderJobData`, `ProductDocument` locally. Core builds to `dist/`, so run `pnpm --filter @flashsale/core build` after changing it or the apps see stale types.
- **Dependencies come in as arguments.** Functions take Redis, Db, Queue, clocks (`now: () => number`) as parameters with production defaults, so tests pass fakes. No module-level clients.
- **Pure where possible.** Config parsing (`loadConfig(env)`), outcome tables, `isOverloaded(lag, max)`: plain inputs, plain outputs, unit tested.
- **Lookup tables over growing `if` chains** (`purchase-response.ts` is the model).
- **Errors:** handlers never throw to Fastify for an expected failure; return a status. Redis/queue unreachable is 503 `{ status: "unavailable" }`. Validation errors are 400 `{ error, message }` with `message` meant for people.
- **Money is integer cents.** Times on the wire are ISO strings; times in Redis are ms epoch.
- **React (`apps/web`)**: function components and hooks, no business rules; `api.ts` is the only file that calls `fetch`.

Check: `pnpm typecheck && pnpm lint`.
