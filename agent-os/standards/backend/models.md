# Models

- One TypeScript interface per document in `packages/core` (`OrderDocument`, `UserDocument`, `ProductDocument`), exported from `index.ts`, used by every app. No ORM.
- Money in integer cents (`priceCents`). Times as `Date` in Mongo, ms epoch in Redis, ISO strings on the wire.
- Sale state is not a model: it lives in Redis (`sale:config` hash, `sale:stock`, `sale:buyers` set) and `SaleGate` owns it.
- Keep documents flat and small; the product is display data only and nothing on the purchase path reads it.
