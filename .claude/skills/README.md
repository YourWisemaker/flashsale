# Project skills

Claude Code loads these on demand: the `description` line in each `SKILL.md` says when.

| Skill | Use when |
|---|---|
| `adr` | Recording a design decision in `docs/adr/` |
| `backend-api` | Adding or changing an HTTP endpoint in `apps/api` |
| `read-database` | Looking at what's in Redis or Mongo, read only |
| `codegraph` | Finding callers, callees, or the blast radius of a change |
| `global-typescript` | Writing any TypeScript here |
| `global-coding-style` | Writing or reviewing any code or docs here |
| `global-git` | Branching, committing, pushing |
| `global-tech-stack` | Choosing a library or asking "why X" |

Agents in `.claude/agents/` own packages; skills are how-tos any agent can pick up.
