# memory-tracker

Counts live objects per label, so a leak shows up as a number that keeps climbing instead of a slow RSS graph you have to squint at.

- `track(object, label)`: +1 created. A `FinalizationRegistry` adds +1 collected when the garbage collector frees the object.
- `snapshot()`: `{ labels: { [label]: { created, collected, live } }, process: { rssMb, heapUsedMb, heapTotalMb, externalMb, arrayBuffersMb } }`.

In the API it's off by default. `MEMORY_TRACKER=1` makes `buildApp` track every request object under `"METHOD /route"` (`"GET unmatched"` for 404s) and serve the snapshot at `GET /debug/memory`. With the flag off the route doesn't exist, so it 404s.

Why requests: a request object holds its headers, body, the session user and everything a handler closes over. If something keeps a reference (a cache, a listener, a promise that never settles), the request's `live` count for that route stops coming back down after load ends. That points at the route to read.

Files:
- `index.ts`: the tracker. No dependencies, injectable registry and `memoryUsage` for tests.
- [`USAGE.md`](USAGE.md): turning it on, reading the numbers, a stress-run recipe.
- [`SUMMARY.md`](SUMMARY.md): what was built, the decisions, tests, limits.

For CPU stalls instead of memory: run the API with `node --cpu-prof` during a stress run and open the `.cpuprofile` in Chrome DevTools.
