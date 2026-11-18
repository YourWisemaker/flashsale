# apps/web

Arief Shop's storefront: one product page, React + Vite. Renders what the API says; no business rules here.

- `api.ts`: the only place that talks HTTP. `fetchProduct` (once), `fetchSale` (polled), `attemptPurchase`, `fetchUserStatus`.
- `App.tsx` composes `components/` (Header, Gallery, FlashSaleBar, PriceBlock, StockMeter, BuyBox, ProductDetails, Footer).
- Hooks: `useSalePolling` (2s), `useProduct`, `usePurchase` (buy, then poll until confirmed), `useProductSeo` (title + JSON-LD), `useNow` (countdown tick).
- Pure helpers, unit tested: `format.ts` (prices in integer cents), `countdown.ts`, `structured-data.ts` (schema.org Product).
- `messages.ts`: every user-facing outcome and status label, in one table.
- `index.html`: static SEO tags; `%VITE_SITE_URL%` comes from the root `.env`.
- `vite.config.ts`: anti-clickjacking headers for dev and preview, and the full production CSP. Don't add inline scripts or inline `<style>`; the production CSP blocks them.
- `public/`: favicon, robots.txt, product photos (CC BY-SA 4.0, credits in `public/products/CREDITS.md` and the footer; keep both if you change photos).

Tests:
- `pnpm --filter @flashsale/web test`: Vitest + jsdom + Testing Library. `App.test.tsx` mocks `./api.js`; no server needed.
- `pnpm test:e2e` (Playwright, `e2e/`): needs `pnpm dev`. `e2e/seed-helper.ts` seeds the real product (`apps/api/src/seed/product.ts`) and a known sale state directly in Redis/Mongo. Uses ports 3000/5173 and the dev databases, so one agent at a time.

The "sold out race" e2e test uses `page.clock.install()` to freeze the status poll. Keep that if you touch polling, or the test turns flaky.
