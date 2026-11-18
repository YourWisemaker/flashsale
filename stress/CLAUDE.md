# stress

Load harness that proves correctness under load: fires real HTTP requests, waits for the queue to drain, then checks Redis and Mongo against invariants (`src/invariants.ts`).

Destructive: each scenario wipes `orders` and reseeds the sale in whatever `REDIS_URL`/`MONGO_URL` point at. Dev databases only.

Needs a running API with `RATE_LIMIT_MAX` raised, plus at least one worker. Exact commands and the last real result are in `README.md` here. If you change a number in that README, it must come from a real run.

Throughput is capped by this single-process client (~12k req/s). For raw server throughput use `npx autocannon` (see root README "Scaling"); this harness is for invariants.
