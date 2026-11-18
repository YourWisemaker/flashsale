# End-to-end tests

Drives a real Chromium browser against the real running stack (api, worker, web, Redis, Mongo), the same flow verified by hand during development: load the page, see the sale is active, buy, watch it go from "pending" to "confirmed", get blocked on a second attempt, and see "sold out" once stock hits zero.

## Setup (one time)

```bash
npx playwright install chromium   # only needed once per machine
```

## Run it

Everything needs to be up first, same as the stress tests:

```bash
docker compose up -d                 # or local redis-server / mongod
pnpm build
pnpm dev                             # api + worker + web
```

Then, in another terminal:

```bash
pnpm --filter @flashsale/web run test:e2e
```

Each test seeds its own sale window and stock directly in Redis/Mongo before driving the browser (`seed-helper.ts`, same approach `stress/` uses), so the two spec files don't depend on whatever state `.env` happened to leave behind.
