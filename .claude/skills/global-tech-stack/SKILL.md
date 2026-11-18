---
name: global-tech-stack
description: The stack in this repo, the version ranges, and why each piece was chosen (with ADR links). Use before adding a dependency or when asked "why X over Y".
---

# Tech stack

| Layer | Choice | Why (ADR) |
|---|---|---|
| Language | TypeScript 5, Node 20+ (24 in dev), ESM | Brief requires JS/TS |
| Monorepo | pnpm 10 workspaces + Turborepo 2 | 0005 |
| API | Fastify 5, `@fastify/rate-limit` (Redis-backed), `@fastify/cookie`, `@fastify/swagger` + `swagger-ui` (static spec) | Brief allows Fastify; lowest overhead per request |
| Purchase gate | Redis 7, one Lua script via ioredis 5 | 0001 |
| Queue | BullMQ 5 on the same Redis, failed set as DLQ | 0002, 0003 |
| Durable store | MongoDB 8, driver 6 | 0004 |
| Auth | fast-jwt (HS256 pinned), scrypt from `node:crypto` | 0009 |
| Frontend | React 18 + Vite 5, tiny pushState router (no router dependency) | Brief requires React |
| Tests | Vitest 2, fast-check 3 (property), Stryker 8 (mutation), Playwright (e2e), custom fetch stress harness, pytest contract tests | 0006, 0008 |
| Lint/format | ESLint 10 flat config + typescript-eslint, `.editorconfig` | |
| Docs | Mintlify (`apps/docs`), Swagger UI at `/docs`, Mermaid diagrams | |

## Adding a dependency

1. Can stdlib, an installed package, or a few lines do it? Then no.
2. If yes it's needed: add it to the one package that uses it (`pnpm --filter <pkg> add <dep>`), not the root (root is for repo tooling only).
3. Record the why in an ADR if it's a real choice between alternatives.

Not used, on purpose: an ORM (one collection shape per use), Express, a CSS framework, a state library, a circuit-breaker library (ioredis connection state is enough, ADR 0011).
