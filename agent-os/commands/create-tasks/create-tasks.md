# Create tasks

Input: `agent-os/specs/<folder>/spec.md`.

Write `tasks.md` in the same folder:

- Group tasks by package so one agent (`.claude/agents/<package>-engineer`) can own a group.
- Order: shared contracts in `packages/core` first, then api/worker/cli, then web, then docs.
- Each task is a checkbox with: the file, the change, the test that proves it, and the command to run.
- Each group ends with its package checks (`pnpm --filter @flashsale/<pkg> typecheck`, `test`, `test:integration`, `test:mutation`).
- Last group: `verifier` runs the full matrix.

Stop and show `tasks.md`.
