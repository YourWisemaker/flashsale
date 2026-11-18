---
name: commit-and-pr
description: Use when the user asks to commit, push, or open a pull request in this repo. Checks the change is verified, stages only what belongs, writes the commit message and PR description in the repo's style, and opens the PR with gh.
---

# Commit and PR

Only when the user asks. "Commit" is not "push", and approval for one commit doesn't cover the next.

## 1. Verified first

The change needs a `verify-and-log` entry from this session (skill in this plugin). No entry, or it failed: run it, or tell the user what's unverified before going on.

## 2. Branch

- On `main` with a change meant for review: `git switch -c <type>/<short-name>` (`feat/`, `fix/`, `chore/`, `docs/`).
- Committing straight to `main` only when the user says so (this repo's history does, for a solo take-home).

## 3. Stage what belongs

```bash
git status --short
git add <paths>          # or git add -A after reading the status
```

Never staged: `docs/brief.md`, `.env`, `.venv/`, `.codegraph/`, `reports/`, `.stryker-tmp/`, Playwright output, real secrets. Check:

```bash
git status --short | grep -E "brief|\.env$|venv|codegraph|reports/|stryker"
git grep --cached -n -I -e $'\u2014' -- . ':!docs/brief.md'   # no em dashes in tracked text
```

Both must print nothing.

## 4. Commit message

Conventional Commits, checked by the husky `commit-msg` hook: `type(scope): summary`, lower-case type, no trailing period. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Scope: `api`, `web`, `core`, `cli`, `worker`, `ci`, `infra`, `readme`.

```
feat(api): graceful shutdown on SIGTERM
fix(web): disable Buy Now once purchased
```

Body when the why isn't obvious: short paragraphs, plain sentences, concrete names (file, env var, ADR number). No em dashes, no marketing words, no bold-label bullets. No `Co-Authored-By` or other AI attribution trailer: commits go out under the author's name only.

```bash
git commit -F - <<'MSG'
<summary>

<body>
MSG
```

The husky pre-commit hook runs `eslint --fix` on staged files and restages them. If it fails, fix the cause; never `--no-verify`.

## 5. Push

```bash
git push -u origin HEAD
```

The pre-push hook runs `pnpm typecheck` and the OpenAPI drift check. Never force-push `main`, never rewrite pushed history.

## 6. Pull request (when asked)

```bash
gh pr create --base main --title "<type(scope): summary>" --body-file - <<'MD'
## What
One or two sentences: what changed and why.

## How
- The moving parts, with file paths.
- Status codes, env vars or invariants touched (CLAUDE.md numbers).

## Verified
Paste the table from the docs/verification-log.md entry.

## Not done / risks
Anything skipped, with the reason.
MD
```

Same prose rules as the commit. Put screenshots in the body when the change is visible (retake them into `apps/docs/images/`).

## Report

Branch, commit hash, push result, PR URL. If a hook failed, say which and what you changed.
