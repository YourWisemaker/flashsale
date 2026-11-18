---
name: codegraph
description: Query the CodeGraph index (symbols, callers, callees, impact) instead of grepping across packages. Use before changing a shared function, when tracing a request path, or when asked what a change affects.
---

# CodeGraph

`codegraph` (installed at `~/.local/bin/codegraph`) keeps a symbol graph of this repo in `.codegraph/` (gitignored, local only).

## Setup and freshness

```bash
codegraph init -i .     # first time: creates .codegraph/ and indexes (~1 s)
codegraph sync .        # after edits: re-index changed files only
codegraph status .      # counts and whether the index is up to date
```

## Queries

```bash
codegraph query SaleGate                # find a symbol
codegraph callers registerLoadShedding  # who calls it (-> buildApp)
codegraph callees buildApp              # what it calls
codegraph impact toPurchaseResponse     # everything affected by changing it, routes included
codegraph context "add a refund endpoint"   # markdown context pack for a task
```

`impact` is the one to run before touching anything in `packages/core`: core is imported by api, worker, cli and stress.

## Limits

- `codegraph affected <file>` misses tests that reach a file through `buildApp` (it reported none for `load-shedding.ts`, but `resilience.test.ts` covers it). Use `impact`, then run the owning package's tests.
- It doesn't index Lua inside template strings, so `purchase.lua` logic is invisible to it. Read `packages/core/src/lua-scripts.ts`.

## As an MCP server

`codegraph install` adds it to Claude Code as an MCP server (it asks which agents). That's a per-user setting; don't commit it.
