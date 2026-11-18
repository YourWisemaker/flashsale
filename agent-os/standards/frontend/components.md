# Components (React, apps/web)

- Function components and hooks. Pages in `src/pages/`, building blocks in `src/components/`.
- No business rules in the UI: render what the API says. `src/api.ts` is the only file that calls `fetch`.
- Every user-visible outcome string lives in `src/messages.ts`.
- Small, focused props: `BuyBox` takes `user`, `saleOpen`, `submitting`, `pending`, `outcome`, `onBuy`, nothing else.
- Account pages share `AuthCard`; don't fork it for one page.
- Tests: Vitest + Testing Library in `App.test.tsx` (drives pages through `openAt(path)`), Playwright e2e for flows.
