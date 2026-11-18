# Verification log

One entry per finished change, written by the `verify-and-log` skill (`.claude/plugins/flash-sale-arief`). Counts are copied from the run, never from memory.

## 2026-11-18 blue/white redesign, graceful shutdown, diagnostics libs, tooling (uncommitted at time of run)

| Check | Result |
|---|---|
| build, typecheck, lint | pass (lint: 0 problems) |
| unit + property | 297 passed (core 109, api 51, cli 56, web 79, worker 2) |
| integration | 141 passed (api 90, cli 45, worker 6) |
| mutation | core 100%, api 100% (one Timeout, counted as killed) |
| e2e (Playwright) | 11 passed |
| contract (pytest) | 7 passed |
| Postman (newman) | 14 requests, 0 failures |
| stress | all invariants pass in 3 scenarios; 14,493 / 13,699 / 16,835 req/s, p99 76 / 33 / 45 ms |
| graceful shutdown (live) | SIGTERM to 2-process API cluster and 2 workers: all 5 exited, port 3000 freed |
| docs | Mintlify broken-links: none; OpenAPI copy in sync |

Notes: worker and cli mutation not rerun (no logic changed there; worker `index.ts` is excluded wiring). Dev data reseeded after stress and e2e.

## 2026-11-18 remove freeze profiler/aws/ai-agent, Purchased button, production notes (uncommitted at time of run)

| Check | Result |
|---|---|
| build, typecheck, lint | pass |
| unit + property | 285 passed (core 109, api 34, cli 56, web 84, worker 2) |
| integration | 141 passed (api 90, cli 45, worker 6); one earlier full run had 1 failure in `server.test.ts` (real-process test, run right after stopping the dev stack), then 5 green runs in a row |
| mutation | api 100% after the removal (414 mutants) |
| e2e (Playwright) | 11 passed, including the new "Purchased" button and the returning-buyer message |
| screenshots | all retaken; new 11-upcoming and 12-ended |
| docs | Mintlify broken-links: none; README relative links all resolve |

Notes: stress not rerun (purchase path unchanged). Dev data reseeded after e2e and screenshots.

## 2026-11-18 infra: Dockerfile, full-stack compose, CI, AWS guide, TRUST_PROXY

| Check | Result |
|---|---|
| build, typecheck, lint | pass |
| unit + property | 286 passed |
| integration | 143 passed (api 92, cli 45, worker 6) |
| mutation | api 100% (424 mutants) |
| Docker | all 4 images build; full stack up healthy; login, buy (202), confirmed by a worker, second buy 409, all through nginx; CSP and X-Frame-Options on the site |
| graceful stop | `docker compose stop api worker`: all exited 0, 5 SIGTERM drains logged |
| CI workflow | actionlint clean (not yet run on GitHub) |
| docs | Mintlify validate and broken-links: pass |
