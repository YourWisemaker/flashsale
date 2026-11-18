# Responsive

- Mobile first in behavior, one breakpoint in practice: `@media (max-width: 860px)` stacks the product grid into one column, lets the flash-sale timer wrap onto its own line, and hides the header email.
- `.container`: max 1200px, 16px side gutter. No horizontal scroll at 360px.
- Images: `max-width: 100%`, `aspect-ratio` on the gallery so layout doesn't jump.
- Tap targets at least 40px tall (`.buy__button` 12px padding).
- Check at 390x844 (the `shop-mobile.png` screenshot) and 1280 wide before shipping a layout change.
