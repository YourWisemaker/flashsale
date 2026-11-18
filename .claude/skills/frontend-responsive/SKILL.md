---
name: frontend-responsive
description: Layout rules for phone and desktop in apps/web (860px breakpoint, 16px gutter, no horizontal scroll). Use when changing page layout or adding a component that has to work on a phone.
---

# Frontend responsive

Standard: `agent-os/standards/frontend/responsive.md`.

- One breakpoint: `@media (max-width: 860px)`. Below it the product grid is one column, the sale timer wraps onto its own line, and the header email hides.
- `.container` is max 1200px with a 16px side gutter. Nothing scrolls sideways at 360px.
- Images get `max-width: 100%`; the gallery keeps `aspect-ratio: 1` so the page doesn't jump while loading.
- Buttons and links you tap are at least 40px tall.

Check at 390x844 and 1280 wide (Playwright or browser devtools). The phone screenshot is `apps/docs/images/shop-phone.png`.
