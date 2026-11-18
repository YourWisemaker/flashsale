# Test writing

- Layers: unit + property (Vitest, fast-check), integration against real Redis and Mongo, mutation (Stryker, 100% on core/api/worker/cli), e2e (Playwright), contract (pytest), stress (invariant checks).
- Test behavior through the public surface: `ctx.app.inject(...)` for routes, `SaleGate` methods for the gate, the real entry point in a child process for startup and shutdown.
- Assert the exact status and body. Don't weaken an assertion to go green.
- Setup in `beforeEach` or inside the test, never `beforeAll` (a throwing `beforeAll` skips tests silently).
- Failure paths need tests too: dead ports for outages, a failing queue fake for enqueue errors.
- Mutation survivors get a test or a `Stryker disable` with the reason the mutant is equivalent.
