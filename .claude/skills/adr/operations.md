# ADR operations

## Create

1. Next number: `ls docs/adr | grep -E '^[0-9]{4}' | tail -1`, add one.
2. File: `docs/adr/NNNN-kebab-title.md` from `template.md`, `Status: Accepted` (or `Proposed` if the user hasn't decided).
3. Add a line to `docs/adr/README.md` in number order: `- [NNNN: Title](NNNN-kebab-title.md)`.
4. Link it where people look: the matching section of `docs/architecture.md`, the root `CLAUDE.md` (and `AGENTS.md`) invariant if it creates one, the Mintlify concept page in `apps/docs/concepts/` if users see the behavior, and `agent-os/product/roadmap.md`.

## Supersede

1. Write the new ADR; its Context says what changed and links the old one.
2. In the old ADR change only the status line: `Status: Superseded by ADR NNNN`. Leave the body as history.
3. Update the index line of the old ADR to add "(superseded by NNNN)".
4. Update any invariant text and docs that quoted the old decision.

## Deprecate

When the decision no longer applies and nothing replaces it (feature removed): `Status: Deprecated`, one sentence under Consequences saying why and when.

## Check after any of these

```bash
ls docs/adr && grep -c "](0" docs/adr/README.md     # every file indexed
grep -rn "ADR 00" CLAUDE.md AGENTS.md docs/architecture.md | head
```
