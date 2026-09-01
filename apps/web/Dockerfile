FROM node:26-bookworm-slim AS build

RUN npm install --global pnpm@11.10.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui-web/package.json packages/ui-web/package.json

RUN pnpm install --frozen-lockfile --filter home-hub --filter @home-hub/web...

COPY tsconfig.base.json ./
COPY apps/web/index.html apps/web/index.html
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/web/tsconfig.app.json apps/web/tsconfig.app.json
COPY apps/web/tsconfig.node.json apps/web/tsconfig.node.json
COPY apps/web/vite.config.ts apps/web/vite.config.ts
COPY apps/web/public apps/web/public
COPY apps/web/src apps/web/src
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/src packages/shared/src
COPY packages/ui-web/tsconfig.json packages/ui-web/tsconfig.json
COPY packages/ui-web/src packages/ui-web/src

ARG VITE_ZERO_CACHE_URL
RUN test -n "$VITE_ZERO_CACHE_URL"
ENV VITE_ZERO_CACHE_URL=$VITE_ZERO_CACHE_URL

RUN pnpm --filter @home-hub/web build

FROM caddy:2.11.4-alpine AS runtime

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

EXPOSE 80 443
