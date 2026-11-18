---
name: adr
description: Write, find, supersede or follow Architecture Decision Records in docs/adr/. Use when a change picks one approach over a real alternative (library, data store, consistency trade-off, failure policy), when someone asks "why did we choose X", or when the user asks for an ADR.
---

# ADRs

Records live in `docs/adr/NNNN-kebab-title.md`, indexed in `docs/adr/README.md`. Current: 0001 to 0011.

| Need | Read |
|---|---|
| The format | `template.md` |
| Create, supersede, deprecate, update the index | `operations.md` |
| Find the ADR for an area, or check a change against one | `queries.md` |

## When to write one

- Choosing between real alternatives (Lua script vs lock, BullMQ vs SQS, Mongo vs Postgres).
- Changing a failure policy or an invariant in `CLAUDE.md`.
- Not for: bug fixes, refactors, renames, or anything with one obvious answer.

## Rules

- One decision per ADR. Numbers come from a real run. No em dashes; tech-lead tone.
- Owner is Arief Fitranto unless told otherwise.
- Code that contradicts an accepted ADR is a bug or needs a new ADR; don't drift silently.

Good examples: `0001` (lock vs Lua), `0010` (idempotency keys), `0011` (fail fast and load shedding).
