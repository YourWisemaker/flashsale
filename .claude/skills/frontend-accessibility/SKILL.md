---
name: frontend-accessibility
description: Accessibility rules for apps/web (labels, live status, focus, contrast, landmarks). Use when adding a form field, a button, a status message, or any interactive element.
---

# Frontend accessibility

Standard: `agent-os/standards/frontend/accessibility.md`.

- Every input has a label: use the `Field` component in `components/AuthCard.tsx` (label `for`, hint via `aria-describedby`).
- Outcomes are announced: the BuyBox message is `role="status"` with `aria-live="polite"`. New async results follow the same pattern.
- Focus stays visible: `:focus-visible` outline in `--brand`. Don't remove an outline without a replacement.
- Contrast: `--text` and `--muted` on white, white on `--brand`, all pass WCAG AA.
- A disabled button needs a reason in text nearby (sold out, not started), not only grey.
- Name landmarks (`nav aria-label="Account"`, `"Breadcrumb"`); toggles use `aria-pressed`.
- Respect `prefers-reduced-motion`.

Check: Testing Library queries by role and label (`getByRole`, `getByLabelText`) in `App.test.tsx`; if a test can't find it by role, a screen reader can't either.
