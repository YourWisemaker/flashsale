# apps/cli

`pnpm cli`: the ops tool. Interactive menu with no arguments; `pnpm cli <command> [args] [--flags]` for scripts.

- `src/commands/*.ts`: one file per command, each a `Command` object (`src/command.ts`). Register it in `src/commands/index.ts`; that list is the menu order.
- `src/run.ts`: shared by menu and direct mode. Prompts for missing inputs (`needs`), asks before anything `destructive` (typed "yes", or `--yes`), refuses destructive work when it can't ask (piped stdin, CI).
- `src/context.ts`: opens Redis, Mongo and the queue once; commands get a `Context`, never env or URLs.
- `src/data/`: the seed product and the demo account. The README and e2e depend on both; tests pin them.
- Pure, unit tested: `sale-window.ts` (flags, then env, then defaults), `product-file.ts` (validates `--file` JSON).

Rules:
- Anything that frees a user's unit goes through `SaleGate.release` (atomic `release.lua`), never a hand-written SREM + INCR.
- New commands that delete data set `destructive: true`; the registry test pins which ones are.

Tests: unit in `src/__tests__/unit`, integration in `src/__tests__/integration` (Redis db 10, Mongo `flashsale_test_cli`), run every command against real data. `src/index.ts` and `src/menu.ts` are excluded from mutation (I/O wiring); the menu was checked by hand through a pseudo-terminal.
