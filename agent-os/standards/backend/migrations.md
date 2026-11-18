# Migrations

- There are no schema migrations: MongoDB documents are written in their current shape, and indexes are created idempotently by `ensureOrderIndexes`, `ensureUserIndexes`, `ensureResetIndexes`.
- `pnpm cli migrate` runs all of them and is safe to re-run; `pnpm cli seed` calls it first.
- Changing a document shape: write code that reads both shapes, backfill with a one-off CLI command (in `apps/cli`, with a confirm prompt), then drop the old branch. Record it in an ADR if it changes a contract.
- Redis keys change only with a coordinated release of every consumer (core keys are a shared contract) and a `pnpm cli reconcile` plan.
