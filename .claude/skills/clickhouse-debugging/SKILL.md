---
name: clickhouse-debugging
description: Debug slow or wrong ClickHouse queries, read only (system.query_log, EXPLAIN, clickhouse-client). ClickHouse is NOT part of this stack today; use this only if an analytics sink for sale events is added.
---

# ClickHouse debugging

**Status: not in this repo.** Orders live in MongoDB and sale state in Redis. ClickHouse would only show up as an analytics sink (purchase attempts per second, outcome mix, latency) fed from the worker or a log pipeline. If you're debugging something today, you want `read-database` instead.

If it gets added, debug read only:

```bash
clickhouse-client --host <host> --user <readonly-user> --readonly 1
```

## Find the slow query

```sql
SELECT event_time, query_duration_ms, read_rows, formatReadableSize(read_bytes) AS read, formatReadableSize(memory_usage) AS mem, query
FROM system.query_log
WHERE type = 'QueryFinish' AND event_time > now() - INTERVAL 1 HOUR
ORDER BY query_duration_ms DESC
LIMIT 20;
```

Failed queries: `type = 'ExceptionWhileProcessing'`, read `exception`.

## Understand it

```sql
EXPLAIN indexes = 1 <query>;     -- is the primary key / skip index used?
EXPLAIN PIPELINE <query>;        -- where the parallelism goes
```

- `read_rows` close to the table size means the `ORDER BY` key doesn't match the filter. For sale events, key by `(sale_id, event_time)`.
- High memory on `GROUP BY` or `JOIN`: aggregate before joining, or use a materialized view.
- Many small parts (`SELECT table, count() FROM system.parts WHERE active GROUP BY table`): insert in batches, not per event.

## Rules

- Read only. No `ALTER`, `OPTIMIZE`, `DROP` or `KILL QUERY` without the user saying so.
- Never put ClickHouse on the purchase path; it's for after-the-fact analysis (invariant 2).
