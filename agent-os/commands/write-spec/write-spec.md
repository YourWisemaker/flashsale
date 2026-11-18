# Write spec

Input: `agent-os/specs/<folder>/planning/requirements.md`.

Write `spec.md` in the same folder:

1. **Goal** in two sentences.
2. **Changes by package**: which files in `packages/core`, `apps/api`, `apps/worker`, `apps/cli`, `apps/web` change and why. One owner per change.
3. **Contracts**: new or changed status codes, bodies, env vars, Redis keys, Mongo indexes. Each lists every consumer to update (OpenAPI spec and its docs copy, README tables, `apps/web/src/api.ts`, `turbo.json`).
4. **Invariants**: which of the 12 in `CLAUDE.md` this touches and how it keeps them.
5. **Tests**: the unit, integration, e2e and stress cases that prove it, named.
6. **Docs**: ADR needed? README/architecture/Mintlify pages to update.

Reuse what exists before proposing new code. Stop and show `spec.md`.
