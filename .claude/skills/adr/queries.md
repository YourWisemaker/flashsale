# Finding the right ADR

## By area

| Area | ADR |
|---|---|
| Purchase gate, overselling, Lua | 0001 |
| Queue, async confirmation, pending vs confirmed | 0002, 0003 |
| MongoDB choice | 0004 |
| Monorepo, pnpm, Turborepo | 0005 |
| Stress harness | 0006 |
| Scaling, cluster, stateless API, fail-fast startup | 0007 |
| Test layers, property and mutation tests | 0008 |
| Accounts, sessions, password reset | 0009 |
| Idempotency keys | 0010 |
| Outages, load shedding, caching | 0011 |
| Graceful shutdown | 0012 |
| Freeze profiler, memory tracker, S3, AI explanation | 0013 |

Keep this table in step with `docs/adr/README.md` when you add one.

## By search

```bash
cat docs/adr/README.md                              # the index
grep -ril "<term>" docs/adr/                        # which ADRs mention it
grep -n "^Status:" docs/adr/*.md                    # what's still in force
grep -rn "ADR 00" CLAUDE.md apps/*/CLAUDE.md        # which invariants cite which ADR
```

## Before changing code an ADR covers

Read its Decision and Consequences. If your change contradicts it, stop: either the change is wrong, or it needs a new ADR that supersedes the old one (`operations.md`).
