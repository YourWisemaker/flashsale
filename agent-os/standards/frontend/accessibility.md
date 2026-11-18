# Accessibility

- Every input has a `<label for>` (the `Field` component in `AuthCard` does this); hints use `aria-describedby`.
- Purchase outcomes are announced: the BuyBox message is `role="status"` with `aria-live="polite"`.
- Visible focus: `:focus-visible` outlines in `--brand` on buttons, links and thumbnails. Never remove an outline without replacing it.
- Contrast: text on white uses `--text` or `--muted` (both pass AA); white on `--brand` passes AA for button text.
- Disabled Buy Now explains itself in text (sold out, not started), not just by greying out.
- Landmarks and names: `nav aria-label="Breadcrumb"`, `nav aria-label="Account"`, gallery thumbnails use `aria-pressed`.
- `prefers-reduced-motion` turns off the stock bar animation.
