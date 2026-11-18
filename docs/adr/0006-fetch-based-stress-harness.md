# ADR 0006: Custom fetch-based load generator instead of autocannon

Status: Accepted
Date: 2026-11-18

## Context

`docs/PRD.md` originally named autocannon for the stress tests. The stress tests here need something autocannon doesn't make easy: a known, unique `userId` on every one of 10,000+ requests, so that after the run the script can assert things like "exactly 100 distinct users have a confirmed order" and "user X's 3 retries produced exactly 1 reservation." Autocannon is built to replay one request shape at high throughput, not to track per-request identity against a post-run database assertion.

## Decision

Built the load generator as a small concurrency pool (`stress/src/concurrency-pool.ts`, under 20 lines) over Node's built-in `fetch`. Each of the three scenarios (`stress/src/scenarios.ts`) builds its own list of `userId`s up front, including deliberate duplicates for the retry scenario, and the pool fires them at a configurable concurrency.

## Consequences

- No new dependency. Node 20+ ships `fetch` natively.
- Full control over what each request sends, which is the entire point: the invariant checks in `stress/src/invariants.ts` depend on knowing exactly which userIds were attempted.
- Lost autocannon's built-in latency histograms and pretty output; reimplemented just the percentiles (p50/p95/p99/max) actually needed in `stress/src/report.ts`, nothing more.
- This is a deviation from the PRD's original plan. Recording it here is the point of this ADR.
