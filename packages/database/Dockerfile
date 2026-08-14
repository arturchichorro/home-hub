FROM node:26-bookworm-slim

RUN npm install --global pnpm@11.10.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui-web/package.json packages/ui-web/package.json

RUN pnpm install --frozen-lockfile --filter @home-hub/database

COPY packages/database/drizzle.config.ts packages/database/drizzle.config.ts
COPY packages/database/drizzle packages/database/drizzle

USER node
WORKDIR /app/packages/database

CMD ["pnpm", "migrate"]
