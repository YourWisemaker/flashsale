---
name: read-database
description: Inspect what's actually in Redis and MongoDB (sale state, buyers, queue, orders, users, outbox) without changing anything. Use when debugging "why does the page say X", checking a stress run, or verifying a fix against real data.
---

# Reading the databases (read only)

Never write, delete, or flush from here. Changes go through `pnpm cli` (it asks before destructive commands) and only when the user asked.

Check which database you're pointing at first: `REDIS_URL` / `MONGO_URL` in `.env`. Tests use Redis db 14 and Mongo `flashsale_test`; dev uses db 0 and `flashsale`.

## Start here

```bash
pnpm cli status     # sale window, stock, buyers, orders, queue counts, product, accounts
pnpm cli outbox     # latest "emails" (password reset links)
```

## Redis

| Key | Type | Meaning |
|---|---|---|
| `sale:config` | hash | `startsAt`, `endsAt` (ms epoch), `totalStock` |
| `sale:stock` | string | units left (the Lua gate decrements it) |
| `sale:buyers` | set | account emails holding a unit (queued or confirmed) |
| `idem:<email>:<key>` | string | idempotency claim or saved response, 24 h TTL |
| `bull:orders:*` | various | BullMQ queue `orders`; `bull:orders:failed` is the DLQ |

```bash
redis-cli HGETALL sale:config
redis-cli GET sale:stock
redis-cli SCARD sale:buyers
redis-cli SISMEMBER sale:buyers demo@example.com
redis-cli ZCARD bull:orders:failed
redis-cli --scan --pattern 'idem:*' | head
```

Use `SCAN`, never `KEYS`, on anything that might be big.

## MongoDB

Collections: `orders` (unique `userId`), `users` (unique `email`), `password_resets` (TTL on `expiresAt`, only token hashes), `products` (one doc), `outbox`.

No `mongosh` on this machine. Use the read-only helper here (find and count only):

```bash
node .claude/skills/read-database/query.mjs orders                      # count + first 5
node .claude/skills/read-database/query.mjs orders '{"userId":"demo@example.com"}'
node .claude/skills/read-database/query.mjs users '{}' 20
```

With Docker: `docker compose exec mongo mongosh flashsale --quiet --eval 'db.orders.countDocuments()'`.

## Invariants worth checking

- `SCARD sale:buyers` + `sale:stock` = `totalStock`.
- Confirmed orders in Mongo is at most `SCARD sale:buyers` (the gap is jobs still queued or in the DLQ).
- `users` never holds a plain password, `password_resets` never a plain token.

If they disagree, report it; `pnpm cli reconcile` is the fix, and it's the user's call to run it.
