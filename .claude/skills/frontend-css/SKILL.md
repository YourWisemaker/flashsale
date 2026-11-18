---
name: frontend-css
description: Styling rules for apps/web (tokens, the blue/white look, no inline styles under the CSP). Use when changing index.css, adding a component's styles, or touching colors, favicon or theme-color.
---

# Frontend CSS

Standard: `agent-os/standards/frontend/css.md`.

- One stylesheet, `apps/web/src/index.css`. Plain CSS with BEM-ish names (`.buy__button`, `.flash-bar--sold_out`).
- Use the tokens on `:root`, never a raw color in a rule. Brand is `--brand #1d4ed8` (dark `#1e3a8a`, light `#3b82f6`, soft `#eff6ff`, tint `#dbeafe`); text `#0f172a`, muted `#64748b`, lines `#e2e8f0`, page `#f4f7fb`.
- Blue on white: white header and cards with a 1px `--line` border, blue accents, 8 to 10px radii, pill tags.
- No inline `style=` and no `<style>`: the production CSP in `apps/web/vite.config.ts` blocks them.
- Changing `--brand`? Update `public/favicon.svg`, `theme-color` in `index.html`, `apps/docs/docs.json` colors and `apps/docs/favicon.svg`, then retake the screenshots in `apps/docs/images/`.

Check: `pnpm --filter @flashsale/web test`, `pnpm lint`, and look at the page at 1280 and 390 wide.
