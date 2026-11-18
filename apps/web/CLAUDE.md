# apps/web

Arief Shop's storefront, React + Vite. Renders what the API says; no business rules here.

- `api.ts`: the only place that talks HTTP. Sale, product, purchase, and every auth call.
- `App.tsx`: the route table. `router.tsx` is a tiny pushState router (`navigate`, `Link`, `useLocation`, `safeNext`); `safeNext` only allows same-site paths after login, so `?next=` can't be an open redirect.
- `auth.tsx`: `AuthProvider` / `useAuth`. `user` is `undefined` while unknown, `null` when logged out.
- `pages/`: Shop, Login, Register, ForgotPassword, ResetPassword, NotFound. Account pages share `components/AuthCard.tsx` and set `noindex` via `usePageMeta` (which edits the one robots tag in index.html, never adds a second).
- `components/`: Header, Gallery, FlashSaleBar, PriceBlock, StockMeter, BuyBox, ProductDetails, Footer.
- Hooks: `useSalePolling` (2s), `useProduct`, `usePurchase` (buy, then poll `/api/purchase/me`), `useProductSeo` (title + JSON-LD), `useNow`.
- Pure helpers, unit tested: `format.ts` (prices in integer cents), `countdown.ts`, `structured-data.ts`.
- `messages.ts`: every user-facing outcome and status label, in one table.
- `vite.config.ts`: anti-clickjacking headers for dev and preview, and the full production CSP. Don't add inline scripts or inline `<style>`; the production CSP blocks them.
- `public/`: favicon, robots.txt, product photos (CC BY-SA 4.0, credits in `public/products/CREDITS.md` and the footer; keep both if you change photos).

Tests:
- `pnpm --filter @flashsale/web test`: Vitest + jsdom + Testing Library. `App.test.tsx` mocks `./api.js` and drives every page through `openAt(path)`; no server needed.
- `pnpm test:e2e` (Playwright, `e2e/`): needs the stack from `AUTH_RATE_LIMIT_MAX=1000 pnpm dev` (the suite logs in more than the default 10/min per IP). `e2e/seed-helper.ts` seeds the real product and demo account from `apps/cli/src/data/` and reads reset links from the outbox. Uses ports 3000/5173 and the dev databases, so one agent at a time.

The "sold out race" e2e test uses `page.clock.install()` to freeze the status poll. Keep that if you touch polling, or the test turns flaky.
