# Testability

- Inject the outside world: Redis, Db, Queue, clocks (`now: () => number`), process hooks (`gracefulShutdown` takes `on`, `exit`, `log`). Production defaults, test overrides.
- Keep decisions pure where possible (`loadConfig(env)`, `isOverloaded(lag, max)`, `toPurchaseResponse(outcome)`).
- Simulate outages with dead ports (`redis://127.0.0.1:1`, `mongodb://127.0.0.1:1`), not mocks.
- Build objects under test in `beforeEach` or inside the test, never at module load, so Stryker sees the mutants.
- Each package has its own Redis db index and Mongo database so suites run in parallel.
