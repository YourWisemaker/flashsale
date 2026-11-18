# Freeze Profiler and Memory Tracker Implementation Plan

> **For agentic workers:** use superpowers:executing-plans to work this task by task. Steps use checkbox (`- [ ]`) syntax.

**Status:** Planned.

**Goal:** Give operators two opt-in diagnostics for the API: a freeze profiler that captures a CPU profile when the event loop blocks, and a memory tracker that reports what large objects are alive and when they're collected. Both off by default, zero cost when off.

**Architecture:** New `apps/api/src/libs/` folder. Each lib exports one `init*(deps)` function called from `server.ts` when its env flag is set; nothing else imports it.
- `libs/freeze-profiler/`: `node:inspector` Session runs the V8 CPU profiler in rolling windows; `monitorEventLoopDelay` checks max lag per window; past the threshold the profile is written to a directory (local) or handed to a storage function (S3 via `libs/aws`).
- `libs/memory-tracker/`: `FinalizationRegistry` tracks registered objects (buffers, streams) with size and context; logs creation and collection; `process.memoryUsage()` snapshot on demand. Docs inside: `README.md`, `USAGE.md`, `SUMMARY.md`.
- `libs/aws/` (S3 store) and `libs/ai-agent/` (Claude explanation): consumed by the freeze profiler, so neither is speculative. Both clients injected for tests.

**Tech Stack:** `node:inspector`, `node:perf_hooks`, `node:v8`, `FinalizationRegistry`, Vitest with injected fakes.

---

### Task 1: Freeze profiler

**Files:** `apps/api/src/libs/freeze-profiler/index.ts`, `index.test.ts`, `apps/api/src/config.ts`, `apps/api/src/server.ts`

- [x] Pure `shouldCapture(maxLagMs, thresholdMs)`; tests for the edge.
- [x] `startFreezeProfiler({ session, histogram, store, agent, now, rollMs, thresholdMs })` with production defaults; injected fakes in tests.
- [x] Flags: `FREEZE_PROFILER=1`, `FREEZE_THRESHOLD_MS` (default 500), `FREEZE_PROFILE_DIR`. Add to `.env.example`, README, `turbo.json`.
- [x] Stops on shutdown (register with the `gracefulShutdown` close).

### Task 2: Memory tracker

**Files:** `apps/api/src/libs/memory-tracker/{index.ts,index.test.ts,README.md,USAGE.md,SUMMARY.md}`

- [x] `createMemoryTracker({ log, enabled })` with `track(obj, kind, size, context)` and `stats()`; disabled tracker is a no-op.
- [x] Tests run with `--expose-gc` or assert via an injected registry fake.
- [x] Flag: `MEMORY_TRACKER=1`.

### Task 3: Verify and document

- [x] `pnpm --filter @flashsale/api typecheck test test:integration test:mutation`
- [x] `pnpm stress` with both flags off: throughput unchanged; with the profiler on: note the overhead in `PERFORMANCE_REVIEW.md`.
- [x] README config table, `apps/api/CLAUDE.md`, an ADR if the capture target (disk vs S3) is a real choice.
