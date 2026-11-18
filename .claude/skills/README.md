# Project skills

Claude Code loads these on demand: the `description` line in each `SKILL.md` says when.

| Skill | Use when |
|---|---|
| `adr` | Writing, finding or superseding a decision in `docs/adr/` (`SKILL.md`, `template.md`, `operations.md`, `queries.md`) |
| `backend-api` | Adding or changing an HTTP endpoint in `apps/api` |
| `frontend-css` | Styling `apps/web`: tokens, the blue/white look, CSP limits |
| `frontend-responsive` | Layout that has to work at 390px and 1280px |
| `frontend-accessibility` | Labels, live status, focus, contrast |
| `read-database` | Looking at what's in Redis or Mongo, read only |
| `clickhouse-debugging` | Only if an analytics sink is added; ClickHouse isn't in the stack today |
| `codegraph` | Finding callers, callees, or the blast radius of a change |
| `global-typescript` | Writing any TypeScript here |
| `global-coding-style` | Writing or reviewing any code or docs here |
| `global-git` | Branching, committing, pushing |
| `global-tech-stack` | Choosing a library or asking "why X" |

Agents in `.claude/agents/` own packages; skills are how-tos any agent can pick up. The rules behind the frontend and global skills live in `agent-os/standards/`.
