# Coding style

Full version: `.claude/skills/global-coding-style/SKILL.md`. The short list:

- Plainest code that works; shortest correct diff. Reuse core, stdlib, or an installed dependency first.
- Build only what the task asks for. No flags, params, or helpers "for later". Delete dead code.
- One reason to change per function or module. Rules in `packages/core`, HTTP mapping in `apps/api`, rendering in `apps/web`.
- Early returns over nested `if`. Lookup tables over growing `if` chains (`apps/api/src/purchase-response.ts`).
- Dependencies come in as arguments (`buildApp(deps)`, `SaleGate(redis, now)`), so tests swap them.
- Two-space indent, LF, UTF-8 (`.editorconfig`). ESLint flat config at the root; `pnpm lint` stays at zero problems.
