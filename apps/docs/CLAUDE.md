# apps/docs

Mintlify docs site. `pnpm docs` from the root serves it on port 3333; `pnpm --filter @flashsale/docs check` finds broken links. `npx mint validate` here checks docs.json and the OpenAPI file.

- `docs.json`: navigation. Guides tab, plus an API reference tab generated from `api-reference/openapi.yaml`.
- `api-reference/openapi.yaml` is a copy of `apps/api/openapi.yaml` (Mintlify only reads files inside this folder). Edit the API's copy, then copy it here; `pnpm docs` does that for you, and this package's `test` script (part of `pnpm test`) fails if they differ.
- `images/`: every screenshot, also used by the root README. Keep paths stable.
- No em dashes. Numbers on these pages (test counts, stress results) must come from a real run.
