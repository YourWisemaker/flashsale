# freeze-profiler

Catches the call stack behind an event loop stall. Load shedding (ADR 0011) answers 503 when the loop lags; this tells you why it lagged.

How it works: a V8 CPU profile runs continuously through `node:inspector` and is cut every 10 s. If `monitorEventLoopDelay` saw a stall of at least `FREEZE_THRESHOLD_MS` in that window, the window's profile is saved; otherwise it's dropped. Open the `.cpuprofile` in Chrome DevTools (Performance tab, load profile) and the blocking function sits at the top of the bottom-up view.

```bash
FREEZE_PROFILER=1 FREEZE_THRESHOLD_MS=300 pnpm --filter @flashsale/api start
ls profiles/                                   # freeze-<time>-<pid>.cpuprofile
```

| Env var | Default | Effect |
|---|---|---|
| `FREEZE_PROFILER` | off | `1` turns it on |
| `FREEZE_THRESHOLD_MS` | 500 | Stall length that triggers a capture |
| `FREEZE_PROFILE_DIR` | `profiles` | Local folder (gitignored) |
| `FREEZE_PROFILE_S3_BUCKET` | unset | Upload to this private bucket instead, via [`../aws`](../aws/s3.ts). Standard AWS credentials and `AWS_REGION` |
| `ANTHROPIC_API_KEY` | unset | Also save `freeze-....md`: Claude's short read of the top frames, via [`../ai-agent`](../ai-agent/client.ts) |

Cost: CPU sampling takes a few percent of CPU. That's why it's opt-in: one instance, or one stress run, not the whole fleet.

Safety: a failed save or explanation is logged and the profiler carries on; it never throws into the API. Rolls never overlap. It stops with the rest of the process on SIGTERM (`gracefulShutdown`).

Tests: `src/__tests__/unit/libs/freeze-profiler.test.ts` (fake inspector, histogram, store and agent).
