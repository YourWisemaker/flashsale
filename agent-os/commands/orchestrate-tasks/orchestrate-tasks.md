# Orchestrate tasks

Input: `agent-os/specs/<folder>/tasks.md` with more than one package group.

1. Write `orchestration.yml` in the spec folder: each task group mapped to a subagent from `.claude/agents/` (`core-gate`, `api-engineer`, `worker-engineer`, `cli-engineer`, `web-engineer`) and the standards it must follow.
2. Run `core-gate` first if core contracts change; everything else depends on its build.
3. Run independent groups in parallel, each in its own git worktree with its own Redis/Mongo (`REDIS_PORT=16379 MONGO_PORT=17017 docker compose -p flashsale-<name> up -d`, then `TEST_REDIS_URL` / `TEST_MONGO_URL`).
4. E2E and stress use fixed ports and dev data: one agent at a time, after merging.
5. Finish with `verifier` and copy its table into `verification.md`.
