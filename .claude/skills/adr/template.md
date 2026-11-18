# ADR template

Copy into `docs/adr/NNNN-kebab-title.md`.

```markdown
# ADR NNNN: <the decision, as a short sentence>

Status: Accepted
Date: <YYYY-MM-DD>

## Context

What forced a decision. Name the concrete problem, the number, or the failure
that was seen. What constraints apply (brief, invariants, existing ADRs).

## Decision

What we do. Bullets for the moving parts. Name files, Redis keys, env vars,
status codes, defaults.

## Consequences

What it costs and what it buys. Measured effect if there is one. What we chose
not to build and why.
```

Status values: `Proposed`, `Accepted`, `Superseded by ADR NNNN`, `Deprecated`.
