# End-to-end tests

Drives a real Chromium browser against the real running stack (api, worker, web, Redis, Mongo): log in, buy, watch "pending" become "confirmed", get blocked on a second attempt, lose the race for the last unit, sign up, forgot and reset password through the emailed link, the upcoming / ended / sold-out screens, SEO tags, and a hostile page failing to frame the shop.

## Setup (one time)

```bash
npx playwright install chromium
```

## Run it

```bash
docker compose up -d                       # or local redis-server / mongod
pnpm build
AUTH_RATE_LIMIT_MAX=1000 pnpm dev          # api + worker + web
```

The suite logs in more than 10 times a minute from one IP, which the default auth rate limit (correctly) blocks, hence the raised limit. Then, in another terminal:

```bash
pnpm test:e2e
```

Each test seeds its own state directly in Redis/Mongo (`seed-helper.ts`, the same approach `stress/` uses): the product and the demo account come from `apps/cli/src/data/`, so the shipped photos and README login are what get tested. Reset links are read from the outbox, the demo's stand-in for an inbox.
