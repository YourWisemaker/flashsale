# Commenting

- Say **why**: the race it prevents, the bug it fixed, the number it came from. Don't narrate what the line does.
- Mark deliberate shortcuts with their ceiling and upgrade path (`// ponytail: per-process cache, ...`).
- Every `Stryker disable` and `eslint-disable` carries a reason on the same or previous line.
- JSDoc on exported functions only when the name and types don't say enough (units, side effects, failure modes).
- Keep comments true. If you change the behavior, change the comment in the same diff.
