---
name: verify-and-log
description: Use when a change looks finished, before saying "done" or committing. Runs the repo's definition-of-done checks that the change calls for, then appends a dated entry with the real results to docs/verification-log.md.
---

# Verify and log

"Done" means the checks ran and the log says so. Numbers in the log come from this run, never from memory.

## 1. Pick the checks

Always:

```bash
pnpm build && pnpm typecheck && pnpm lint
pnpm test && pnpm test:integration
```

Then by what changed (`git diff --stat main...HEAD` plus uncommitted):

| Touched | Also run |
|---|---|
| `packages/core`, `apps/api`, `apps/worker`, `apps/cli` logic | `.tools/stryker/run-changed.sh` (100% expected) |
| Purchase path (core gate, purchase route, worker) | API with `RATE_LIMIT_MAX=100000` + a worker, then `pnpm stress` |
| `apps/web` or auth | `AUTH_RATE_LIMIT_MAX=1000 pnpm dev`, then `pnpm test:e2e` |
| A route, status code or body | `pnpm test:python` and `pnpm test:postman` against the running API |
| `apps/api/openapi.yaml` | copy to `apps/docs/api-reference/`, `pnpm --filter @flashsale/docs test` |

Stop what you start, by port: `lsof -ti:3000,5173 | xargs kill`. Stress and e2e change dev data: run `pnpm cli seed --force` after.

## 2. Log it

Append to `docs/verification-log.md` (create it with a `# Verification log` heading if missing). Newest at the bottom:

```markdown
## 2026-11-18 graceful shutdown (commit abc1234, or "uncommitted")

| Check | Result |
|---|---|
| typecheck, lint | pass |
| unit | 280 passed |
| integration | 142 passed |
| mutation (core, api) | 100%, 100% |
| e2e | 11 passed |
| stress | skipped: purchase path untouched |

Notes: anything flaky, anything skipped and why.
```

Rules: copy counts from the output. A failure is logged as a failure with the test name. "Skipped" always has a reason.

## 3. Report

Tell the user the table in short form and where the log entry is. If anything failed, that goes first.
