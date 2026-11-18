# ADR 0004: MongoDB for the durable order record

Status: Accepted
Date: 2026-11-18

## Context

The assessment brief doesn't name a database; it leaves that choice open. A MERN-style stack (Mongo) was the preferred direction, with PostgreSQL as the fallback if Mongo couldn't run on this development machine. The durable record itself is about as simple as data gets: one document per order, `{ userId, status, createdAt }`, looked up by `userId`.

## Decision

Use MongoDB. Confirmed locally first (`mongod --version` succeeded, a local instance started and accepted connections) before committing to it, so this wasn't a choice made without checking it would actually run here. A single unique index on `userId` is the entire schema design this needs: it's what makes `confirmOrder`'s upsert safe to call twice for the same user (a replayed job, a retried job) without a duplicate-key error or a second order.

## Consequences

- No ORM, no migrations. The native `mongodb` driver and one `createIndex` call (`packages/core/src/orders.ts`) are the whole persistence layer.
- A relational database would have worked just as well here; the data has no relations to speak of. Postgres was the documented fallback and stays that way if Mongo isn't available in some other environment, the swap only touches `packages/core/src/orders.ts` and `mongo.ts`, nothing in the API or worker route/job logic.
- Docker Compose (`docker-compose.yml`) ships Mongo 8 for anyone who doesn't want to install it locally.
