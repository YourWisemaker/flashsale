# Shape spec

Turn a rough idea into clear requirements before writing a spec.

1. Create `agent-os/specs/<YYYY-MM-DD>-<slug>/` and `planning/raw-idea.md` with the user's words verbatim.
2. Read what it touches: root `CLAUDE.md` invariants, the package `CLAUDE.md`, the relevant ADRs, and `codegraph impact <symbol>` for shared code.
3. Ask at most 5 numbered questions, each with a proposed default, covering scope, status codes, failure behavior, and what's out of scope.
4. Write `planning/requirements.md`: goal, user-facing behavior, API/status changes, invariants at risk, out of scope, open questions.
5. Stop and show `requirements.md`.
