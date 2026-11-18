# apps/web

React + Vite UI. Renders what the API says; no business rules here.

- `api.ts`: the only place that talks HTTP. Maps response bodies to `PurchaseStatus`.
- `App.tsx`: one component; `MESSAGES` is the single table of user-facing text.
- `useSalePolling.ts`: polls `/api/sale` every 2s.

Tests:
- `pnpm --filter @flashsale/web test`: Vitest + jsdom + Testing Library. `App.test.tsx` mocks `./api.js`; no server needed.
- `pnpm test:e2e` (Playwright, `e2e/`): needs the full stack from `pnpm dev`. `e2e/seed-helper.ts` puts the sale in a known state directly in Redis/Mongo. Uses ports 3000/5173 and the dev databases, so only one agent runs it at a time.

The "sold out race" e2e test uses `page.clock.install()` to freeze the status poll. Keep that if you touch polling, or the test turns flaky.
