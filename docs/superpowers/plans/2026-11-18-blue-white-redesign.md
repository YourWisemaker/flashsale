# Blue and White Redesign Implementation Plan

> **For agentic workers:** use superpowers:executing-plans to work this task by task. Steps use checkbox (`- [ ]`) syntax.

**Status:** Done.

**Goal:** Move the storefront off the orange marketplace look to a clean blue and white design, and retake every screenshot in the README and docs site.

**Architecture:** CSS only. Every color already goes through tokens on `:root` in `apps/web/src/index.css`, so the change is new token values plus a handful of rules that hard-coded orange gradients. No component or markup changes, so tests and e2e selectors stay valid.

**Tech Stack:** Plain CSS custom properties, Vite, Playwright for screenshots.

---

### Task 1: Tokens

**Files:** `apps/web/src/index.css`

- [x] Brand `#1d4ed8`, dark `#1e3a8a`, light `#3b82f6`, soft `#eff6ff`, tint `#dbeafe`; text `#0f172a`, muted `#64748b`, line `#e2e8f0`, page `#f4f7fb`, subtle `#f8fafc`; radius 10px.

### Task 2: Components

**Files:** `apps/web/src/index.css`

- [x] Header: white with a 1px bottom border, blue gradient logo mark, blue "Log in" button.
- [x] Flash bar: blue gradient, white digit chips. Ended/sold out: slate.
- [x] Cards, gallery, price block: 1px borders, 8 to 10px radii. Tags and the discount badge as pills.
- [x] Inputs: 8px radius, blue focus ring. Notices with rounded corners.

### Task 3: Brand assets

**Files:** `apps/web/public/favicon.svg`, `apps/web/index.html` (`theme-color`), `apps/docs/favicon.svg`, `apps/docs/docs.json` (colors)

- [x] Replace `#f4511e` everywhere; `grep -rniE "f4511e|ff7043|d84315"` returns nothing.

### Task 4: Screenshots

**Files:** `apps/docs/images/{shop,login,shop-mobile}.png`, `apps/docs/images/flow/01..10.jpg`

- [x] Run API and web without a worker so "pending" can be captured; clear the demo's order first (`pnpm cli user:clean demo@example.com --yes`, since `seed --force` keeps orders).
- [x] Playwright at 1568x564 for flows, 1280x860 for shop/login, 390x844 @2x for mobile. Start the worker for "confirmed"; reseed with `--stock 1` and a second buyer for "sold out".
- [x] Restore dev data afterwards (delete the second buyer, clean demo, `pnpm cli seed --force`).

### Task 5: Verify

- [x] `pnpm --filter @flashsale/web test`, `pnpm lint`
- [x] `AUTH_RATE_LIMIT_MAX=1000 pnpm dev` then `pnpm test:e2e`
- [x] Look at every retaken image.
