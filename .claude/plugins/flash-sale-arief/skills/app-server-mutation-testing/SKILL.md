---
name: app-server-mutation-testing
description: Use when changing production logic or tests in apps/api (the app server), or when reading Stryker results. Runs mutation testing, explains survivors, and gets the score back to 100% without weakening tests.
---

# Mutation testing the app server (apps/api)

The bar is 100% on `apps/api` (also core, worker, cli). A surviving mutant means a test would pass with that bug in the code.

## Run it

```bash
pnpm --filter @flashsale/api test:mutation        # full run, a few minutes, needs Redis + Mongo
.tools/stryker/run-changed.sh                     # only packages changed vs origin/main
.tools/stryker/run-changed.sh --dry-run           # just print what it would run
```

Config: `apps/api/stryker.config.mjs`. Mutates `src/**/*.ts` except tests and `server.ts` (wiring). Runs unit and integration tests together, concurrency 1, because integration tests share Redis db 14. Report: `apps/api/reports/mutation/index.html`.

Don't run it at the same time as `pnpm --filter @flashsale/api test:integration`: same database.

## Reading a survivor

```
[Survived] ArithmeticOperator
src/load-shedding.ts:9:10
-   return maxLagMs > 0 && lagMs > maxLagMs;
+   return maxLagMs > 0 && lagMs >= maxLagMs;
```

Ask which assertion would notice. Usually one of:

- **Test data too easy.** Values far from the boundary can't catch `>` turned into `>=`; already-sorted input can't catch a broken sort; one item can't catch a broken `join("\n")`. Test the edge.
- **Branch never observed.** A guard like `if (request.url === WORKS_WITHOUT_REDIS) return` survives as `if (false)` when no test sends that route with Redis down. Assert the outcome on both sides.
- **Setup trap.** Work done in `beforeAll` or at import runs before Stryker activates the mutant. Build objects in `beforeEach` or inside the test.

## Equivalent mutants

When no test can tell the difference (a default that matches the library's default, a fallback that's skipped anyway), disable that one mutant with the reason:

```ts
// Stryker disable next-line ObjectLiteral: 10ms is also Node's default resolution.
```

Never a blanket disable, never deleting the assertion that fails. Code that only runs in a child process can't be killed by Stryker (the active mutant lives in the test runner); test it in a real process and disable with that reason.

## Timeouts and NoCoverage

- `Timeout` counts as detected (usually a hook that never resolves).
- `NoCoverage` means no test runs that line: often a production default parameter. Add a test that uses the default.

## Done when

The run prints `All files | 100.00`. If you leave a survivor, say which and why in the PR.
