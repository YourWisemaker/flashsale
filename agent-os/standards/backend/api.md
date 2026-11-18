# API (Fastify, apps/api)

How-to with a checklist: `.claude/skills/backend-api/SKILL.md`.

- Routes live in `apps/api/src/routes/<area>.ts` as `registerXRoute(app, deps)`, taking only the deps they use. `buildApp(deps)` wires them.
- `POST /api/purchase` is Redis only: session check in memory, rate limit, optional idempotency claim, `purchase.lua`, enqueue. No Mongo, no user lookup.
- App-wide behavior goes in hooks: security headers (`onSend`), load shedding (`onRequest`, runs before route hooks), Mongo outage mapping (`setErrorHandler`).
- Status codes are a contract: change `apps/api/openapi.yaml`, its copy in `apps/docs/api-reference/`, the README table and `apps/web/src/api.ts` together. `openapi.test.ts` fails if a served route is undocumented.
- Rate limit anything that writes or takes user input (`app.rateLimit` in `onRequest`).
