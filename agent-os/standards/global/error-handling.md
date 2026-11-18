# Error handling

- **Expected failures are responses, not exceptions.** Routes return a status: 400 bad input, 401 no session, 403 sale not open, 409 already bought or key in flight, 410 sold out, 429 rate limited, 503 dependency down or shedding.
- **Dependency outages are 503 `{ status: "unavailable" }`**, never 500. Redis not ready: the load-shedding hook answers before any command. Mongo connection errors: the app error handler maps them (ADR 0011).
- **Never leave a unit stranded.** If the enqueue fails after a reservation, run `release.lua` and answer 503 (invariant 5). Don't add timeouts around `EVALSHA` on the API client.
- **Workers retry, then park.** BullMQ retries 5 times with backoff; the failed set is the DLQ; `pnpm cli dlq:replay` brings jobs back.
- **Shutdown drains.** SIGTERM closes Fastify (in-flight requests finish), then the queue, Redis and Mongo; a 10s deadline forces exit 1 (`gracefulShutdown` in core).
- **Messages are for people.** `{ error, message }` with a sentence a buyer can act on. The web app maps a 503 without a message to "Something's down on our end".
