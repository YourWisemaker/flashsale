# Arief Shop: Flash Sale System

A flash sale for one limited-edition product: a configurable sale window, fixed stock, one unit per account, built to hold up when thousands of people press "Buy Now" in the same second. Fastify API, BullMQ worker, React storefront, Redis for the hot path, MongoDB for the durable record, in a pnpm + Turborepo monorepo.

| Shop | Log in | Phone |
|---|---|---|
| ![Shop page, logged in](apps/docs/images/shop-desktop.png) | ![Log in page](apps/docs/images/login-page.png) | ![Shop page on a phone](apps/docs/images/shop-phone.png) |

## Contents

- **Get started**: [Test account](#test-account) · [Quick start](#quick-start) · [Project structure](#project-structure)
- **Requirements**: [Requirements at a glance](#requirements-at-a-glance) · [How it works](#how-it-works) · [The frontend, requirement by requirement](#the-frontend-requirement-by-requirement) · [The flow](#the-flow) · [What it does](#what-it-does)
- **Reference**: [API](#api) · [Ops CLI](#ops-cli) · [Configuration](#configuration)
- **Testing and scale**: [Tests](#tests) · [Stress tests](#stress-tests) · [Scaling](#scaling) · [Trade-offs](#trade-offs)
- **Repository**: [Docs](#docs) · [Deploy to AWS](docs/deploy/aws.md)

## Test account

| Email | Password |
|---|---|
| `demo@example.com` | `FlashSale2026!` |

Created by `pnpm cli seed`, which also resets its password, so this login always works on a freshly seeded dev setup. Development only; never seed it into a real deployment. You can also sign up with any email on the site.

## Quick start

Needs Node 20+, pnpm, and Redis + MongoDB (Docker or local installs).

```bash
docker compose up -d        # Redis + MongoDB (or run redis-server / mongod yourself)
cp .env.example .env        # optional: every setting has a working local default
pnpm install                # also installs the git hooks (husky)
pnpm build                  # builds packages/core first; the apps import its compiled output
pnpm cli seed               # indexes, product, sale window (starts in 1 minute), demo account
pnpm dev                    # API :3000, worker, web :5173
```

Open http://localhost:5173 and log in with the test account. To start the sale right now instead of in a minute: `pnpm cli seed --force --start now --minutes 60`.

### Or run the whole stack in Docker

Production builds of every service (API cluster, 2 workers, nginx serving the storefront, Redis, MongoDB, a one-shot seed):

```bash
AUTH_SECRET=$(openssl rand -hex 32) docker compose -f docker-compose.full.yml up --build
```

Open http://localhost:8080 and log in with the test account. The sale starts immediately and runs an hour (`SALE_MINUTES`, `SALE_STOCK` to change it). `docker compose -f docker-compose.full.yml down -v` removes everything.

## Project structure

```
flashsale/
├── package.json                       # pnpm workspaces root: dev, build, test, stress, cli scripts
├── pnpm-workspace.yaml
├── turbo.json                         # task graph + env vars passed through to tasks
├── tsconfig.base.json
├── eslint.config.mjs                  # one flat ESLint config for every package
├── docker-compose.yml                 # Redis 7 + MongoDB 8 for local dev
├── docker-compose.full.yml            # whole stack in containers (production builds)
├── Dockerfile                         # multi-target: api, worker, web (nginx), cli
├── deploy/                            # nginx.conf (web image), ecs/ task definitions for CD
├── .github/workflows/                 # ci.yml (tests, e2e, mutation, Docker smoke), release.yml (GHCR + ECS)
├── .env.example                       # every setting, with working local defaults
├── packages/
│   └── core/                          # the rules, shared by every app
│       └── src/
│           ├── lua-scripts.ts         # atomic purchase + release Lua scripts
│           ├── sale-gate.ts           # SaleGate: configure, purchase, release, snapshot
│           ├── keys.ts                # Redis key names, job options, orderJobId
│           ├── orders.ts              # confirmOrder: upsert on the unique userId index
│           ├── product.ts             # product display data (one Mongo doc)
│           ├── shutdown.ts            # gracefulShutdown: drain on SIGTERM, 10 s deadline
│           ├── redis.ts, mongo.ts     # client factories
│           └── auth/                  # scrypt passwords, signed sessions, reset tokens, outbox
├── apps/
│   ├── api/                           # Fastify HTTP server
│   │   ├── openapi.yaml               # API contract, served as Swagger UI at /docs
│   │   └── src/
│   │       ├── server.ts              # entrypoint: cluster (API_PROCESSES), graceful shutdown
│   │       ├── app.ts                 # buildApp(deps): plugins, hooks, routes (no globals)
│   │       ├── load-shedding.ts       # 503 before any Redis call when Redis is down or loop lags
│   │       ├── idempotency.ts         # Idempotency-Key claim / replay / release
│   │       ├── purchase-response.ts   # gate outcome -> HTTP status table
│   │       ├── session.ts             # session cookie: set, clear, requireUser
│   │       ├── config.ts              # env -> config, refuses unsafe production config
│   │       ├── routes/                # sale, purchase, auth, product, health
│   │       └── libs/memory-tracker/   # opt-in: live objects per route at /debug/memory
│   ├── worker/                        # BullMQ consumer
│   │   └── src/                       # index.ts (entry + shutdown), worker.ts, processor.ts
│   ├── cli/                           # pnpm cli: ops tool
│   │   └── src/
│   │       ├── commands/              # seed, status, user:clean, reset, dlq:replay, reconcile, ...
│   │       ├── data/                  # seed product + demo account
│   │       └── menu.ts, run.ts        # interactive menu, confirm-before-delete
│   ├── web/                           # React + Vite storefront
│   │   ├── src/
│   │   │   ├── api.ts                 # the only file that calls fetch
│   │   │   ├── pages/                 # Shop, Login, Register, ForgotPassword, ResetPassword
│   │   │   ├── components/            # BuyBox, FlashSaleBar, StockMeter, Gallery, ...
│   │   │   ├── usePurchase.ts         # buy, poll until confirmed, know if already bought
│   │   │   ├── messages.ts            # every user-facing outcome text
│   │   │   └── index.css              # blue/white theme tokens on :root
│   │   ├── public/                    # favicon, robots.txt, product photos
│   │   └── e2e/                       # Playwright: buy, race, sold out, accounts, clickjacking
│   └── docs/                          # Mintlify site (pnpm docs); images/ = every screenshot
├── stress/src/
│   ├── scenarios.ts                   # the 3 scenarios (26,000 requests)
│   ├── run-scenario.ts                # fire requests, wait for the queue to drain
│   └── invariants.ts                  # no oversell, no duplicates, Redis = Mongo
├── tests/python/                      # black-box contract tests (pytest) vs openapi.yaml
├── postman/                           # Postman collection + local environment
├── docs/
│   ├── architecture.md                # diagram, request walkthrough, scaling
│   ├── adr/                           # decisions 0001 to 0013
│   ├── deploy/aws.md                  # AWS deployment guide
│   ├── PRD.md                         # original design spec
│   └── verification-log.md            # dated results of the full check matrix
├── .claude/                           # agents (one per package), skills, flash-sale-arief plugin
├── agent-os/, .pi/, .serena/          # agent standards, plans, code navigation
├── .husky/                            # pre-commit lint, pre-push typecheck
├── CLAUDE.md, AGENTS.md               # how to work in this repo
├── PERFORMANCE_REVIEW.md              # measured numbers, knobs, next levers
└── REPOSITORY_ANALYSIS.md             # size, coverage, risks
```

Each package has its own `CLAUDE.md` with local rules. Tests sit next to the code in `src/__tests__/` (unit, integration) in every package.

## Requirements at a glance

| Requirement | Where it's met |
|---|---|
| Configurable sale window, purchases only inside it | `purchase.lua` checks start and end against Redis's clock; set with `pnpm cli seed --start/--end` or `SALE_START`/`SALE_END` |
| One product, limited stock, never oversold | One atomic Lua script per attempt; stress runs end with exactly `totalStock` confirmed orders |
| One unit per user | Same script records the buyer; job id, unique index and `Idempotency-Key` stop duplicate orders |
| Status, purchase, "did I get one" endpoints | `GET /api/sale`, `POST /api/purchase`, `GET /api/purchase/me` (see API) |
| Frontend: status, user identifier, Buy Now, outcome feedback | React storefront; the identifier is the account email you log in with ([ADR 0009](docs/adr/0009-accounts-and-sessions.md) says why) |
| System diagram | Below, and in [`docs/architecture.md`](docs/architecture.md) |
| Throughput, scalability, fault tolerance | Stateless API cluster, async order queue, load shedding, fail-fast on outages, DLQ, graceful shutdown (Scaling, Trade-offs) |
| Unit, integration and stress tests | See Tests and Stress tests; results explained in [`stress/README.md`](stress/README.md) |

## How it works

A purchase never touches the database. A load-shedding hook first answers 503 if Redis is unreachable or the process is saturated. Then the API checks the session cookie (a signature check in memory), then runs one atomic Redis Lua script that checks the sale window against Redis's own clock, checks whether this account already bought, checks stock, and decrements, all in one round trip. Two requests racing for the last unit can't both win. A winner is handed to a queue (BullMQ, on the same Redis); a worker confirms it into MongoDB. Everything else (product details, accounts, password resets) lives off that path.

```mermaid
flowchart TD
    U["Browser (React)"] -->|"HTTPS + session cookie"| LB["Load balancer"]
    LB --> S0

    subgraph API["Fastify API: N stateless processes"]
        direction TB
        S0["0. Load shedding<br/>503 if Redis is down or the loop lags"] --> S1["1. Verify session<br/>in memory, no DB"]
        S1 --> S2["2. Rate limit per account<br/>+ Idempotency-Key claim"]
        S2 --> S3["3. purchase.lua<br/>window, dedupe, stock, decrement"]
        S3 --> S4["4. Enqueue<br/>jobId = order-userId"]
    end

    subgraph REDIS["Redis: one server, two jobs"]
        direction LR
        GATE[("Purchase gate (synchronous)<br/>sale:config, sale:stock, sale:buyers<br/>rate-limit counters, idem:*")]
        QUEUE[["Order queue (asynchronous)<br/>BullMQ: bull:orders:*"]]
        DLQ[["Failed set (DLQ)<br/>bull:orders:failed"]]
    end

    S2 --> GATE
    S3 -->|"atomic: decides who gets a unit"| GATE
    S4 -->|"hand-off: answer 202 pending now"| QUEUE
    QUEUE --> W["Order worker: N processes"]
    W -->|"upsert, unique userId index"| M[("MongoDB<br/>durable orders, accounts, product")]
    W -->|"after 5 failed attempts"| DLQ
    DLQ -.->|"pnpm cli dlq:replay"| QUEUE
    API -.->|"status, accounts, product, order status"| M
```

The two Redis boxes are the same server used two ways: the **purchase gate** is read and written inside the request (the atomic Lua script decides who gets a unit, in about a millisecond); the **order queue** is BullMQ's job list, which the worker drains afterwards to write the durable order to MongoDB. The buyer only waits for the first. In production they can be split onto two Redis instances.

The full writeup, with a request walkthrough, failure handling, and measured scaling, is in [`docs/architecture.md`](docs/architecture.md). Each major decision has an ADR in [`docs/adr/`](docs/adr/README.md).

## The frontend, requirement by requirement

| The frontend lets a user... | How | Screenshot |
|---|---|---|
| See the current status of the sale | Flash-sale bar: Starts soon / Live now / Sold out / Ended, with a countdown and stock left; refreshed every 2 s | 1, 7, 11, 12 |
| Enter a user identifier | Log in with an email (and password), so "one per user" means one per real account | 2 |
| Click Buy Now | The button under "Buying as <email>" | 3 |
| Learn the purchase succeeded | "Success! You bought one. Your order is confirmed." The button turns grey and reads Purchased | 4, 5 |
| Learn they already bought | "You already secured one. One per person.", also shown when they come back later | 6 |
| Learn the sale ended or sold out | "Sold out. Better luck next time." / "The sale has ended.", Buy Now disabled | 7, 12 |

**Order successful:**

![Order confirmed: success message and a disabled Purchased button](apps/docs/images/flows/05-confirmed.jpg)

## The flow

Captured in a real browser against the running stack.

| | |
|---|---|
| ![Logged out](apps/docs/images/flows/01-logged-out.jpg) **1. Logged out.** The sale is live; buying needs an account. | ![Log in](apps/docs/images/flows/02-login.jpg) **2. Log in.** |
| ![Logged in](apps/docs/images/flows/03-logged-in.jpg) **3. Logged in.** "Buying as" shows who the purchase is for. | ![Pending](apps/docs/images/flows/04-pending.jpg) **4. Pending.** The unit is reserved in Redis; the worker hasn't confirmed it yet. |
| ![Confirmed](apps/docs/images/flows/05-confirmed.jpg) **5. Confirmed.** Success message, stock drops to 99, the button turns into a disabled Purchased. | ![Already purchased](apps/docs/images/flows/06-already-purchased.jpg) **6. Coming back.** The page already knows: one per account. |
| ![Sold out](apps/docs/images/flows/07-sold-out.jpg) **7. Sold out.** The button disables and the page says why. | ![Register](apps/docs/images/flows/08-register.jpg) **8. Sign up.** |
| ![Forgot password](apps/docs/images/flows/09-forgot-password.jpg) **9. Forgot password.** Same answer whether or not the email has an account. | ![Reset password](apps/docs/images/flows/10-reset-password.jpg) **10. Reset password**, from the emailed one-time link. |
| ![Upcoming](apps/docs/images/flows/11-upcoming.jpg) **11. Upcoming.** Countdown to the start; Buy Now disabled. | ![Ended](apps/docs/images/flows/12-ended.jpg) **12. Ended.** The page says so; Buy Now disabled. |

On a phone it stacks into one column (third screenshot at the top).

## What it does

**The sale, per the brief**
- Configurable start and end time; purchases outside the window are refused (`upcoming` / `ended`), checked inside Redis against Redis's clock so several API processes can't disagree.
- One product, fixed stock, never oversold, enforced by one atomic Lua script.
- One unit per account, enforced in the same script.
- No duplicate orders, at three layers: the Lua gate records the buyer atomically, the queue job id is fixed per account (a second enqueue is dropped), and the order write is an upsert on a unique index. On top of that, `Idempotency-Key` makes a retried request safe: the web app sends a fresh key per click and retries once on a network error with the same key, so a lost response comes back as the original "pending" instead of "already purchased".
- Status, purchase, and "did I get one" endpoints; a storefront showing live status, countdown, stock, and every outcome.

**Accounts**
- Sign up, log in, log out. Buy Now uses the logged-in account, so nobody can buy as someone else by typing their id.
- Forgot password emails a link that works once and expires in 30 minutes. There's no mail provider in this demo: email lands in an outbox collection, readable with `pnpm cli outbox` (the brief allows mocking cloud services). Swapping in SES or SendGrid replaces one function.

**Storefront**
- Product page in a blue and white theme (colors are tokens on `:root` in `apps/web/src/index.css`): gallery, flash-sale bar with countdown, price with discount, stock meter, specs. Works down to phone width.
- SEO: title, meta description, canonical, Open Graph, schema.org Product JSON-LD with live availability, robots.txt; account pages are `noindex`.
- Photos by LouisBlaut, CC BY-SA 4.0, via Wikimedia Commons, cropped; credited in the page footer and `apps/web/public/products/CREDITS.md`.

**Security**
- Passwords hashed with scrypt, compared in constant time. Login failures give one message, and checking an unknown email costs the same time as a wrong password, so neither reveals which emails have accounts.
- Sessions are signed JWTs (HS256 pinned, so `alg: none` and other-algorithm tokens are rejected) in an `httpOnly`, `SameSite=Strict`, `Secure`-in-production cookie: page scripts can't read it, and other sites can't make the browser send it.
- Reset tokens are stored only as a hash, single use even under a race, and Mongo expires them on its own.
- Rate limits: purchases per account (people behind one office IP don't block each other), log in / sign up / reset per IP per minute.
- Anti-clickjacking: `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` on the API (errors included) and the web server; the production preview adds a full CSP (no inline scripts), checked with zero violations. Whatever serves the built site in production must send these headers too, because `frame-ancestors` can't be set from HTML.
- The API refuses to start in production without its own `AUTH_SECRET`.

**Resilience**
- Redis down: every route that needs it answers 503 in milliseconds, decided from the client's connection state before any command is sent; the product page still renders. Mongo down: 503 within 2 s instead of 30. The worker keeps longer retries so a short blip doesn't fill the DLQ.
- A saturated process sheds requests with 503 + `retry-after` instead of slowing down for everyone. Shedding happens before the purchase gate, so a shed request never holds a unit. ADR 0011.
- Graceful shutdown: on SIGTERM the API stops accepting, finishes in-flight requests, then closes the queue, Redis and Mongo; the worker finishes active jobs first. 10 s deadline, then exit 1. ADR 0012.

**Diagnostics (off by default)**
- `MEMORY_TRACKER=1`: live request objects per route at `GET /debug/memory`, to spot leaks after a stress run. [`apps/api/src/libs/memory-tracker`](apps/api/src/libs/memory-tracker/README.md). ADR 0013.

## API

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/sale` | no | `{ status, startsAt, endsAt, totalStock, stockLeft }`; status is `upcoming` / `active` / `ended` / `sold_out`. A CDN may cache it 1 s (`s-maxage=1`). |
| GET | `/api/product` | no | Name, price, photos, specs. Cached 60 s in the API and cacheable (`max-age=60`). 404 if not seeded. Still served while Redis is down. |
| POST | `/api/purchase` | yes | 202 `pending`, 409 `already_purchased`, 410 `sold_out`, 403 `upcoming` / `ended`, 401 not logged in, 429 `rate_limited`, 503 `unavailable`. Optional `Idempotency-Key` header: a retry with the same key gets the original response (`Idempotent-Replayed: true`), or 409 `in_progress` while the first is still running. |
| GET | `/api/purchase/me` | yes | `{ userId, status }`; status is `none` / `pending` / `confirmed`. Only your own. |
| POST | `/api/auth/register` | no | `{ email, password }` → 201 and a session cookie; 400 invalid email or weak password; 409 email taken |
| POST | `/api/auth/login` | no | 200 and a session cookie; 401 "Wrong email or password." for every failure |
| POST | `/api/auth/logout` | no | 204, cookie cleared |
| GET | `/api/auth/me` | yes | `{ email }` or 401 |
| POST | `/api/auth/forgot` | no | 202 with the same message whether or not the email has an account |
| POST | `/api/auth/reset` | no | `{ token, password }` → 200 and a session cookie; 400 invalid or expired link |
| GET | `/health` | no | 200 when Redis and Mongo respond, else 503 |
| GET | `/docs` | no | Swagger UI for this table, from `apps/api/openapi.yaml` |
| GET | `/debug/memory` | no | Only with `MEMORY_TRACKER=1` (404 otherwise): live request objects per route and process memory |

Any route except `/api/product` answers 503 `unavailable` at once while Redis is unreachable, and 503 with `retry-after: 1` while the process is saturated (event loop lag past `MAX_EVENT_LOOP_LAG_MS`). Every response carries the anti-clickjacking and `nosniff` headers. Errors are `{ error, message }`, with `message` meant for people.

## Ops CLI

`pnpm cli` opens a numbered menu. `pnpm cli <command>` runs one directly, for scripts. Commands that delete data ask first (type `yes`), or take `--yes`, and print which databases they'll touch.

| Command | What it does |
|---|---|
| `status` | Sale, product, accounts, buyers, orders and queue at a glance |
| `migrate` | Create Mongo indexes (safe to re-run) |
| `seed [--stock N] [--start ISO\|now] [--end ISO \| --minutes N] [--force]` | Migrate, write the product, seed the sale window and the demo account |
| `product:inject [--file product.json]` | Write the product (validated); default is the built-in one |
| `product:clean` | Remove the product display data |
| `user:create <email> <password>` | Create a login |
| `user:delete <email>` | Delete a login and its purchase data |
| `user:clean <userId>` | Free one account's unit (atomically, back into stock), delete their order and queued job |
| `users:clean` | Delete every order, buyer and queued job; stock back to full |
| `reset` | Delete everything: sale, buyers, queue, orders, product, accounts, emails |
| `dlq:replay` | Move failed jobs back onto the queue |
| `reconcile` | Rebuild Redis buyers and stock from Mongo plus the queue, after a Redis loss |
| `outbox [email]` | Show the latest emails the app sent, e.g. reset links |

`pnpm seed`, `pnpm dlq:replay` and `pnpm reconcile` are shortcuts for the matching commands.

## Configuration

All in `.env` (copy `.env.example`). Defaults work for local development.

| Variable | Default | Notes |
|---|---|---|
| `REDIS_URL`, `MONGO_URL` | localhost | |
| `SALE_START`, `SALE_END`, `SALE_STOCK` | starts in 1 min, runs 1 h, 100 | Read by `pnpm cli seed`; flags override them |
| `PORT` | 3000 | API |
| `API_PROCESSES` | 1 | API processes on this host (cluster mode) |
| `RATE_LIMIT_MAX` | 5 | Purchases per account per second |
| `AUTH_RATE_LIMIT_MAX` | 10 | Log in / sign up / reset attempts per IP per minute |
| `MAX_EVENT_LOOP_LAG_MS` | 200 | Shed requests with 503 past this event loop lag; 0 turns it off |
| `MEMORY_TRACKER` | off | `GET /debug/memory` with live objects per route |
| `TRUST_PROXY` | off | `1` behind nginx or a load balancer: per-IP limits read `X-Forwarded-For` |
| `AUTH_SECRET` | dev value | Signs sessions. Required (32+ chars) in production |
| `WEB_URL` | http://localhost:5173 | Links in reset emails |
| `COOKIE_SECURE` | on in production | Session cookie only over HTTPS |
| `WORKER_CONCURRENCY` | 10 | Jobs per worker process |
| `VITE_SITE_URL` | http://localhost:5173 | Canonical and Open Graph URLs |
| `NODE_ENV` | unset | `production` requires a real `AUTH_SECRET` and turns on secure cookies |
| `VITE_API_URL` | http://localhost:3000 | Where the web dev server proxies `/api` |
| `STRESS_API_URL`, `STRESS_CONCURRENCY` | http://localhost:3000, 300 | Stress harness target and in-flight requests |
| `TEST_REDIS_URL`, `TEST_MONGO_URL` | localhost | Point the test suites at other infra (parallel agents, CI) |

## Tests

| Layer | Command | What it proves | Count |
|---|---|---|---|
| Unit | `pnpm test` | Gate logic, auth (tokens, hashing, forged and expired sessions), idempotency keys, CLI commands and validation, React pages and components | 286 |
| Property-based | part of `pnpm test` | fast-check runs hundreds of random purchase/release sequences and concurrent bursts against a plain reference model of the rules | 7 properties |
| Integration | `pnpm test:integration` | Every endpoint and status code, idempotent retries and concurrent duplicates, real Redis and Mongo, the cluster entry point, a real BullMQ worker and DLQ, every CLI command | 143 |
| Mutation | `pnpm test:mutation` | Stryker changes the code (flip a `<`, drop a branch) and checks a test fails each time | 100% on core, api, worker, cli |
| End-to-end | `pnpm test:e2e` | Real Chromium, real stack: buy flow, the race for the last unit, sign up, forgot and reset password, SEO tags, a hostile page failing to frame the shop | 11 |
| Contract (Python) | `pnpm test:python` | pytest against the running API: every status code it sees must be in `openapi.yaml`, plus security headers and cache headers. Read only | 7 |
| Postman | `pnpm test:postman` | The collection in `postman/` run by newman: every endpoint, cookie session carried between requests | 14 requests, 0 failures |
| Lint | `pnpm lint` | ESLint 10 flat config (`eslint.config.mjs`), typescript-eslint, react-hooks | 0 problems |
| CI/CD | GitHub Actions: `ci.yml`, `release.yml` | CI: lint, typecheck, unit and integration on every push and PR; e2e; mutation on `main`; Docker build plus a purchase through nginx. CD: after CI passes on `main`, publishes the images to GHCR and (once AWS is configured) deploys to ECS | 2 workflows |
| Stress | `pnpm stress` | 26,000 requests across 3 scenarios, then invariant checks | 3 scenarios |

```bash
pnpm test && pnpm test:integration      # needs Redis + Mongo
pnpm test:mutation                       # a few minutes
AUTH_RATE_LIMIT_MAX=1000 pnpm dev        # then, in another terminal:
npx playwright install chromium          # one time
pnpm test:e2e

python3 -m venv .venv && .venv/bin/pip install -r tests/python/requirements.txt   # one time
pnpm test:python                         # needs a running API (pnpm dev) and pnpm cli seed
pnpm test:postman                        # the Postman collection via newman, same running API
```

The e2e suite logs in many times a minute from one IP, which is exactly what the auth rate limit is there to stop, hence the raised limit for that run.

## Stress tests

```bash
API_PROCESSES=2 RATE_LIMIT_MAX=100000 pnpm --filter @flashsale/api start   # purchase limit opened up
WORKER_CONCURRENCY=25 pnpm --filter @flashsale/worker start                 # run twice, two terminals
pnpm stress
```

Virtual users carry signed session cookies, as if they'd logged in before the sale opened, which is what real flash-sale traffic looks like. Three scenarios: 10,000 users racing for 100 units, 1 user firing 1,000 concurrent attempts, and 5,000 users each clicking 3 times against 2,000 units. After each, the script waits for the queue to drain and checks Redis and Mongo directly.

Expected outcome: every invariant passes. Exactly 100 / 1 / 2,000 confirmed orders, zero duplicates, stock never negative, Redis and Mongo agree.

Latest run (2026-11-18, load shedding and graceful shutdown in place): all invariants pass, 13,700 to 16,800 req/s from a single client process, p99 76 ms at worst. The client is the limit, not the server (see Scaling). An earlier run's full output, including the job split between the two workers, and how to read it: [`stress/README.md`](stress/README.md).

## Scaling

The API and worker hold no state, so both scale by running more processes. Measured on an 8-core laptop, with the load generator on the same machine:

| API processes | req/s | p50 |
|---|---|---|
| 1 | 33,700 | 5 ms |
| 2 | 52,700 | 3 ms |
| 4 | 42,300 | 4 ms |

Past two processes the shared Redis and the CPU the load generator also needs become the limit (424,000 Redis ops/s, about 10 per purchase). Next steps, cheapest first: rate limit at the load balancer, give Redis its own host, then Redis Cluster. A crashed API process is replaced (killed one with `-9` under traffic: 40 of 40 requests still returned 200); one that fails at startup stops the cluster instead of fork-looping. Details in [`docs/architecture.md`](docs/architecture.md) and [`PERFORMANCE_REVIEW.md`](PERFORMANCE_REVIEW.md).

### How it scales further

| Layer | Today (local) | Scale-out path |
|---|---|---|
| API | `API_PROCESSES=N` on one host | Same image in N containers behind a load balancer; no sticky sessions needed (session is a signed cookie, state is in Redis) |
| Worker | Start more processes | More containers; BullMQ hands each job to one worker. Order writes are paced by `WORKER_CONCURRENCY`, not by traffic |
| Redis | One local instance | Own host first, then Redis Cluster with the three sale keys in one `{sale}` hash slot. Past one shard: split stock into N buckets, route users by hash |
| MongoDB | One local instance | Replica set; `orders` is keyed by `userId` and shards cleanly |
| Static web + status reads | Vite preview | CDN for the built assets; `GET /api/sale` already sends `s-maxage=1`, so an edge collapses polling to one read per second |

### Before running this in production

This repo runs everything locally (the brief allows that), and `docker-compose.full.yml` runs the production images. For AWS, follow [`docs/deploy/aws.md`](docs/deploy/aws.md): ECS Fargate, MemoryDB, MongoDB Atlas, CloudFront and WAF. In any environment:

1. **Managed Redis with a replica and failover**, AOF on. It's the purchase gate, the queue and the rate limiter, so it's the single point of failure today.
2. **MongoDB replica set** (or Atlas) for the durable order record.
3. **Rate limiting at the gateway or load balancer** as well as in the API: stops abuse before it costs a Redis call, and removes about half the Redis work per purchase.
4. **Secrets and HTTPS**: a real `AUTH_SECRET` (the API refuses to start without one when `NODE_ENV=production`), TLS at the edge, secure cookies (on automatically in production).
5. **Serve the web build with the same security headers** the dev server sends (`X-Frame-Options: DENY`, CSP with `frame-ancestors 'none'`): they can't be set from HTML.
6. **Real email** in place of the outbox collection (one function to swap for SES or SendGrid).
7. **Pre-scale before the sale opens** rather than autoscaling into the spike, and give the orchestrator a grace period of at least 10 s so graceful shutdown can drain (ADR 0012).
8. **Observability**: ship the JSON logs, alert on 503 rate, DLQ size (`bull:orders:failed`) and the gap between Redis buyers and Mongo orders; run `pnpm cli reconcile` only after looking at that gap.

## Trade-offs

- **Redis is the source of truth during the sale**, Mongo the durable record written after. Fast hot path; the cost is a `reconcile` step if Redis is ever lost, and up to ~1 s of reservations at risk with AOF `everysec`.
- **Idempotency keys are optional on the API.** The web app always sends one; a client that doesn't still can't create a duplicate order (three layers above), it just gets "already purchased" on a retry instead of a replay.
- **"Pending" before "confirmed".** The page shows that state instead of hiding it behind a spinner.
- **Login required to buy.** One extra step for the buyer, and it's what makes "one per user" mean one per real account instead of one per typed string.
- **Single Redis instance**: the bottleneck and single point of failure if traffic outgrows one box. First thing to change for production.
- **No waiting room, no timed stock holds.** The Redis gate answers in about a millisecond, so there's no slow backend for a waiting room to protect; rate limits and the queue shape the spike. The brief has no payment step, so a reservation is final and nothing needs to expire.
- **No real email**: the outbox stands in for a provider, so password reset works end to end without a third-party account.

## Docs

- **Docs site**: `pnpm docs` serves the Mintlify site on http://localhost:3333: guides, the flow screenshots, and an API reference generated from the OpenAPI spec.
- **Swagger UI**: http://localhost:3000/docs on the running API (raw spec at `/docs/json`). The spec is `apps/api/openapi.yaml`; a test fails if a route is missing from it.
- [`PERFORMANCE_REVIEW.md`](PERFORMANCE_REVIEW.md): what a purchase costs, every measured number, how to reproduce, which knob to turn
- [`REPOSITORY_ANALYSIS.md`](REPOSITORY_ANALYSIS.md): shape, size, coverage, risks ranked by production impact
- [`docs/deploy/aws.md`](docs/deploy/aws.md): deploying to AWS (ECS Fargate, MemoryDB, Atlas, CloudFront, WAF), with steps and a pre-sale checklist
- [`docs/architecture.md`](docs/architecture.md): diagram, request walkthrough, failure handling, scaling numbers, known limits
- [`docs/adr/`](docs/adr/README.md): the reasoning behind each major choice
- [`docs/verification-log.md`](docs/verification-log.md): what was checked before each change shipped, with real counts
- [`stress/README.md`](stress/README.md): stress test design and full results
- [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md): working in this repo, alone or with parallel agents. Skills in `.claude/skills/`, the repo's plugin in `.claude/plugins/flash-sale-arief` (`claude --plugin-dir .claude/plugins/flash-sale-arief`); `codegraph init -i .` builds a local symbol graph (gitignored)
