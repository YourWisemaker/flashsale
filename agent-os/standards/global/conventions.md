# Conventions

- **Layout**: `packages/core` (rules), `apps/api`, `apps/worker`, `apps/cli`, `apps/web`, `apps/docs`, `stress/`, `tests/python/`. Apps import core, never each other.
- **ESM**: relative imports end in `.js`. Core compiles to `dist/`; rebuild it after changes (`pnpm --filter @flashsale/core build`).
- **Names**: Redis keys in `packages/core/src/keys.ts` (`sale:config`, `sale:stock`, `sale:buyers`), collections as exported constants (`ORDERS_COLLECTION`). Never inline a key or collection string elsewhere.
- **Env vars**: read in one pure `loadConfig(env)` per app, listed in `.env.example`, the README config table, and `turbo.json` `globalPassThroughEnv`.
- **Docs**: every decision with a real alternative gets an ADR (`docs/adr/`). Numbers in docs come from a real run.
- **Git**: commit only when asked; hooks run lint-staged on commit and typecheck plus the spec drift check on push.
- **Prose**: no em dashes, concrete names, tech-lead tone.
