---
name: global-git
description: Branching, commit and push rules for this repo, including what must never be committed. Use before any git write.
---

# Git

- **Commit or push only when the user asks.** Approval for one commit doesn't cover the next.
- On `main`? Ask whether to commit there or on a branch (`feat/<short-name>`, `fix/<short-name>`). Parallel agents use worktrees (root `CLAUDE.md`, "Working in parallel").
- Before committing, the matrix is green: `pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration`. Touched core, api, worker or cli: `pnpm test:mutation` too. Touched web or auth: `pnpm test:e2e`.
- Stage paths explicitly. Never `git add -A` blind; read `git status` first.

## Never commit

- `docs/brief.md` (confidential, gitignored), `.env`, anything with a real secret.
- `.codegraph/`, `.stryker-tmp/`, `reports/`, `dist/`, Playwright output, `.venv/`.
- Names of other companies' private projects.

## Messages

Conventional Commits, enforced by the husky `commit-msg` hook: `type(scope): summary`. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Scope is the package or area (`api`, `web`, `core`, `cli`, `worker`, `ci`, `infra`, `readme`).

```
feat(api): add load shedding and Swagger UI
fix(ci): mongo service health check
```

Body only when the why isn't obvious: plain sentences, no em dashes, no bold-label bullets. No `Co-Authored-By` or other AI attribution trailer. Never `--no-verify`, never force-push `main`, never rewrite pushed history.
