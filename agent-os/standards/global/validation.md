# Validation

- **Validate at the trust boundary**: route handlers in `apps/api`, CLI argument parsing in `apps/cli`, and `product:inject` file input. Core functions assume valid input.
- **Never trust the body for identity.** The buyer is the email in the signed session (invariant 3).
- **Normalize before storing or comparing**: `normalizeEmail` for accounts; returns `null` for invalid input, which the route turns into 400 `invalid_email`.
- **Passwords**: `passwordProblem()` in core enforces 8 to the max length; the same rule shows as a hint in the form.
- **Idempotency-Key**: 8 to 128 of `[A-Za-z0-9_-]`, else 400 `invalid_idempotency_key` before the gate runs.
- **Client-side checks are convenience only.** The web form can block an obvious mistake, but the API repeats every check.
