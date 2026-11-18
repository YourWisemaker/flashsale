# CSS

- One stylesheet: `apps/web/src/index.css`. Plain CSS, BEM-ish class names (`.buy__button`, `.flash-bar--sold_out`). No CSS framework, no CSS-in-JS.
- **Tokens on `:root`**, never raw colors in rules: `--brand #1d4ed8`, `--brand-dark #1e3a8a`, `--brand-light #3b82f6`, `--brand-soft #eff6ff`, `--brand-tint #dbeafe`, `--text #0f172a`, `--muted #64748b`, `--line #e2e8f0`, `--page #f4f7fb`, `--card #fff`, `--subtle #f8fafc`, status colors `--success`, `--warning`, `--error`, `--info`, `--radius 10px`.
- The look is blue on white: white header and cards with a 1px `--line` border, blue accents, 8 to 10px radii, pill tags.
- **No inline styles and no `<style>` tags**: the production CSP blocks them (`apps/web/vite.config.ts`).
- Keep the favicon (`public/favicon.svg`), `theme-color` in `index.html` and Mintlify `docs.json` colors in step with `--brand`.
