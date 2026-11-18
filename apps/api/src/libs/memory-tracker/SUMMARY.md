# memory-tracker: summary

## What was built

- `MemoryTracker` (`index.ts`, ~70 lines): per-label created / collected / live counts via `FinalizationRegistry`, plus process memory in MB.
- API wiring (`apps/api/src/app.ts`): when `AppDeps.memoryTracker` is set, an `onRequest` hook tracks each request as `"METHOD /route"` and `GET /debug/memory` returns the snapshot. `server.ts` sets it only when `MEMORY_TRACKER=1`.
- Config: `MEMORY_TRACKER` in `config.ts`, `.env.example`, `turbo.json`.

## Decisions

- **Off by default, route absent when off.** A debug endpoint that exists but is "disabled" is still an endpoint. Not registering it means a normal deployment has nothing to probe.
- **Track request objects, not buffers.** This API doesn't handle files; what it creates per hit is the request. A leak here would hang off a request, so that's the useful thing to count.
- **Label by route pattern, not URL.** `/api/purchase/me` and friends stay one label each; query strings can't blow up the label count.
- **Counts, not a heap profiler.** It answers "is something leaking, and on which route" cheaply. A heap snapshot answers "what exactly", and costs a pause.
- **Injectable registry and `memoryUsage`.** Tests drive "garbage collection" by hand, so they're deterministic.

## Tests

- `src/__tests__/unit/libs/memory-tracker.test.ts`: counting per label, MB rounding, the real registry and `process.memoryUsage`.
- `src/__tests__/integration/debug-memory.test.ts`: 404 when off; per-route and unmatched counts when on.
- Covered by Stryker with the rest of `apps/api`.

## Limits

- V8 runs finalizers when it likes: counts are a trend, not exact.
- Per process. With `API_PROCESSES > 1` each process has its own numbers.
- One `FinalizationRegistry` registration per request when on. Measure before leaving it on in production.
