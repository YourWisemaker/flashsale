# ADR 0013: Opt-in diagnostics: freeze profiler and memory tracker

Status: Accepted
Date: 2026-11-18

## Context

Load shedding (ADR 0011) says when a process is saturated, not why. Two questions stay open after a bad stress run: which code blocked the event loop, and whether anything leaks under load.

## Decision

Libraries in `apps/api/src/libs/`, all off by default and switched on per process by env var:

- `freeze-profiler` (`FREEZE_PROFILER=1`): a V8 CPU profile runs continuously and is cut every 10 s; a window with an event loop stall past `FREEZE_THRESHOLD_MS` (default 500) is saved as a `.cpuprofile`.
- `aws` (`FREEZE_PROFILE_S3_BUCKET`): S3 store for those profiles, encrypted at rest, standard AWS credential chain. Local folder otherwise.
- `ai-agent` (`ANTHROPIC_API_KEY`): one Messages API call per capture that names the likely blocking call from the top frames, saved next to the profile.
- `memory-tracker` (`MEMORY_TRACKER=1`): live request objects per route via `FinalizationRegistry`, served at `GET /debug/memory`; the route doesn't exist when off.

## Consequences

- Nothing changes for a normal run: no sampling, no extra route, no network call.
- Turned on, the profiler costs a few percent of CPU and the tracker one registry entry per request. Meant for one instance or one stress run.
- Two new dependencies in `apps/api` (`@aws-sdk/client-s3`, `@anthropic-ai/sdk`), used only on the diagnostic path. Both clients are injected, so tests use fakes.
- The AI explanation sends function names and file paths (no request data) to Anthropic. Leave `ANTHROPIC_API_KEY` unset where that isn't acceptable.
