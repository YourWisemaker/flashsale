# syntax=docker/dockerfile:1.7
# One multi-target Dockerfile for the whole monorepo, built from the repo root:
#   docker build --target api    -t flashsale-api .
#   docker build --target worker -t flashsale-worker .
#   docker build --target web    -t flashsale-web --build-arg VITE_SITE_URL=https://shop.example .
#   docker build --target cli    -t flashsale-cli .
# The workspace is installed and built once; each target copies what it runs.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# Dependencies first, from manifests only, so code changes don't bust this layer.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/cli/package.json apps/cli/
COPY apps/web/package.json apps/web/
COPY apps/docs/package.json apps/docs/
COPY stress/package.json stress/
# --ignore-scripts: skips the husky hook install (no .git in the build context).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
# Baked into index.html (canonical and Open Graph URLs). Set it to the public URL.
ARG VITE_SITE_URL=http://localhost:8080
ENV VITE_SITE_URL=$VITE_SITE_URL
RUN pnpm turbo run build --filter=@flashsale/core --filter=@flashsale/api --filter=@flashsale/worker --filter=@flashsale/web

# Same tree without dev dependencies, for the Node runtimes.
FROM build AS prod
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:${NODE_VERSION}-alpine AS node-runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod --chown=node:node /repo/node_modules ./node_modules
COPY --from=prod --chown=node:node /repo/package.json ./
COPY --from=prod --chown=node:node /repo/packages/core ./packages/core
USER node

FROM node-runtime AS api
COPY --from=prod --chown=node:node /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
# Node as PID 1 receives SIGTERM directly, so graceful shutdown (ADR 0012) runs.
CMD ["node", "dist/server.js"]

FROM node-runtime AS worker
COPY --from=prod --chown=node:node /repo/apps/worker ./apps/worker
WORKDIR /repo/apps/worker
CMD ["node", "dist/index.js"]

# Ops tool (seed, status, reconcile, dlq:replay). Runs TypeScript via tsx, so it keeps dev deps.
FROM build AS cli
WORKDIR /repo/apps/cli
ENTRYPOINT ["node", "--import", "tsx", "src/index.ts"]
CMD ["status"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
