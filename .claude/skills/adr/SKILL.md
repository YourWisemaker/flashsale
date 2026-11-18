---
name: adr
description: Write an Architecture Decision Record in docs/adr/. Use when a change picks one approach over a real alternative (a library, a data store, a consistency trade-off, a failure-handling policy), or when the user asks for an ADR.
---

# Writing an ADR

1. Next number: `ls docs/adr` and add one. Four digits, kebab-case title: `docs/adr/0012-short-title.md`.
2. Use this shape and nothing more:

```markdown
# ADR 0012: <decision as a short sentence>

Status: Accepted
Date: <YYYY-MM-DD, today>

## Context

What forced a decision. Name the concrete problem, number, or failure.

## Decision

What we do. Bullets for the moving parts. Name files, keys, env vars, status codes.

## Consequences

What this costs and what it buys. Include what we chose not to build and why.
```

3. Add a line to `docs/adr/README.md`, in order.
4. Link it from where people will look: the relevant section of `docs/architecture.md`, the root `CLAUDE.md` invariant if it creates one, and `apps/docs` if it changes behavior users see.

Rules:
- One decision per ADR. Superseding one: new ADR, set the old one's status to `Superseded by ADR 00NN`.
- Every number in it comes from a real run (stress, benchmark, test count).
- No em dashes; tech-lead tone (see `global-coding-style`).
- Owner is Arief Fitranto unless told otherwise.

Examples worth copying: `0001` (lock vs Lua), `0010` (idempotency keys), `0011` (fail fast and load shedding).
