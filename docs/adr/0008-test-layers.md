# ADR 0008: Property-based and mutation tests on top of unit and integration

Status: Accepted
Date: 2026-11-18

## Context

The core risk in this system is a race in the purchase gate. Example-based tests only check the cases someone thought to write down. Line coverage only shows code ran, not that a test would notice it breaking. Several real bugs got past the original suite (see the README's "Bugs the test layers caught").

## Decision

Six layers, each answering a different question:

1. **Unit**: pure logic and React components, fast.
2. **Property-based** (fast-check, `packages/core`): random purchase/release sequences are checked step by step against a plain in-memory reference model, and random concurrent bursts against the invariants (winners = min(stock, unique users), nobody wins twice, Redis agrees with what callers were told).
3. **Integration**: real Redis and Mongo, every endpoint and failure path, the real cluster entry point, a real BullMQ worker.
4. **Mutation** (Stryker, core/api/worker): proves the tests notice a change. Break threshold 75%; all three are at 100%.
5. **End-to-end** (Playwright): the user-visible flow in a real browser.
6. **Stress**: invariants after 26,000 real HTTP requests.

## Consequences

- Mutation testing paid for itself on the first run: core went from 61.5% to 100% by adding tests for code that had none inside its own package (`orders.ts`, `isReserved`), deleting two dead guards it exposed, and fixing a setup trap where a failing `beforeAll` made Vitest skip tests instead of failing them.
- Stryker runs at concurrency 1 per package because the tests share real databases. Packages still run in parallel because each uses its own Redis db index and Mongo database.
- Two log-message mutants are excluded with `// Stryker disable next-line`, each with a reason. Log wording isn't behavior.
- No fake Redis anywhere. The Lua scripts are the thing being tested, and they only mean something inside real Redis.
