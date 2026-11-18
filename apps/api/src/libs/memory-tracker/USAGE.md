# Using memory-tracker

## Turn it on

```bash
MEMORY_TRACKER=1 pnpm --filter @flashsale/api start
curl -s localhost:3000/debug/memory | jq
```

```json
{
  "labels": {
    "GET /api/sale": { "created": 1200, "collected": 1187, "live": 13 },
    "POST /api/purchase": { "created": 26000, "collected": 25991, "live": 9 }
  },
  "process": { "rssMb": 142.3, "heapUsedMb": 38.1, "heapTotalMb": 61.5, "externalMb": 3.2, "arrayBuffersMb": 0.4 }
}
```

Debug only. It adds a `FinalizationRegistry` entry per request (cheap, but not free) and exposes process numbers. Don't leave it on behind a public load balancer.

## Reading it

- `live` right after a burst is normal: the garbage collector runs when it wants to, not when a request ends.
- `live` that settles back near zero a few seconds after load stops: no leak.
- `live` that stays high, or climbs run after run for one route: that route's objects are being kept. Read the handler and anything it registers (listeners, caches, timers).
- `heapUsedMb` rising with flat `live` counts: the leak isn't in request objects; take a heap snapshot (`node --inspect`, Chrome DevTools, Memory tab).

`collected` lags behind reality. V8 makes no promise about when finalizers run, so treat the numbers as a trend, never an exact count.

## During a stress run

```bash
MEMORY_TRACKER=1 RATE_LIMIT_MAX=100000 pnpm --filter @flashsale/api start
WORKER_CONCURRENCY=25 pnpm --filter @flashsale/worker start
curl -s localhost:3000/debug/memory > before.json
pnpm stress
sleep 30; curl -s localhost:3000/debug/memory > after.json
```

Compare `live` per route in `after.json` with `before.json`. With `API_PROCESSES` above 1, each request lands on one process and each process has its own tracker, so use one process for this.

## Tracking something else

```ts
import { MemoryTracker } from "./libs/memory-tracker/index.js";

const tracker = new MemoryTracker();
tracker.track(someBuffer, "upload buffer");
tracker.snapshot().labels["upload buffer"]; // { created, collected, live }
```
