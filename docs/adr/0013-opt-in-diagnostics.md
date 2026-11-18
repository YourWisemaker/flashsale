# ADR 0013: Opt-in memory tracker

Status: Accepted (amended the same day: the freeze profiler, S3 store and AI explanation were removed)
Date: 2026-11-18

## Context

Load shedding (ADR 0011) says when a process is saturated. After a bad stress run one question stays open: does anything leak under load, and on which route?

## Decision

`apps/api/src/libs/memory-tracker`, off by default. `MEMORY_TRACKER=1` makes the API track every request object per route through `FinalizationRegistry` and serve the counts at `GET /debug/memory`. With the flag off the route isn't registered.

A freeze profiler (continuous V8 CPU profiling, saved to disk or S3, with an optional Claude explanation) was built under this ADR and then removed: the brief doesn't need it, load shedding already handles saturation, and it brought two SDK dependencies for a diagnostic path. For a one-off stall, `node --cpu-prof` during a stress run gives the same profile with no code in the repo.

## Consequences

- Nothing changes for a normal run: no extra route, no extra work per request.
- Turned on, one registry entry per request. Meant for one instance or one stress run.
- No new dependencies.
