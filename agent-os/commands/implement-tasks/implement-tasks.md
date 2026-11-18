# Implement tasks

Input: `agent-os/specs/<folder>/tasks.md`.

1. Work the groups in order. Tick a checkbox only when the code is in and its test passes.
2. Follow the standards in `agent-os/standards/` and the skills in `.claude/skills/`.
3. After `packages/core` changes, rebuild it before running consumers.
4. When a task turns out wrong or blocked, stop and say so. Don't skip it silently.
5. Verify, and write the results to `verification.md` in the spec folder with real counts:

```bash
pnpm build && pnpm typecheck && pnpm lint
pnpm test && pnpm test:integration
pnpm test:mutation                 # packages you touched; or .tools/stryker/run-changed.sh
pnpm test:e2e                      # if web or auth changed (AUTH_RATE_LIMIT_MAX=1000 pnpm dev)
pnpm stress                        # if the purchase path changed
```

6. Update the docs that state a number, command or status code you changed. Don't commit unless asked.
