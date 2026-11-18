---
name: global-coding-style
description: How code, comments, tests and docs are written in this repo (KISS, YAGNI, SOLID, comment style, test style, prose style). Use for any change or review.
---

# Coding style

## Code

- Plainest thing that works. Reuse core, stdlib, or an installed dependency before writing new code. Shortest correct diff.
- Build what the task asks for. No flags, params, helpers or config "for later". Dead code gets deleted.
- One reason to change per function or module. Data access, rules and HTTP mapping stay in separate pieces.
- Early returns over nested `if`. If a function needs a comment to explain its flow, split it.
- Deliberate shortcuts get a comment naming the ceiling and the upgrade path, e.g. `// ponytail: per-process cache, ...`.

## Comments

- Explain **why**, not what: the race it prevents, the bug it fixed, the number it came from.
- A Stryker disable always says why the mutant is equivalent: `// Stryker disable next-line StringLiteral: <reason>`.
- An ESLint disable always says why too.

## Tests

- Every branch, parser, money or security path leaves a test that fails if it breaks. Mutation score stays at 100% on core, api, worker, cli.
- Setup goes in `beforeEach` or inside the test, never `beforeAll` (a throwing `beforeAll` skips tests silently).
- Real Redis and Mongo for integration tests; fakes only for the failure you're simulating (a dead port beats a mock).
- Don't weaken an assertion to go green. Find the cause.

## Prose (docs, ADRs, commits, PRs)

- No em dashes. Use a comma, colon, parentheses, or two sentences.
- Tech-lead tone: plain sentences, concrete names (file, key, endpoint, number). No marketing adjectives, no filler openers.
- Banned words: delve, crucial, pivotal, tapestry, foundational, robust, seamless, landscape, realm.
- Numbers in docs come from a real run.
