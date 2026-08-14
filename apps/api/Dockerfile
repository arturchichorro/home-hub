FROM node:26-bookworm-slim AS dependencies

RUN npm install --global pnpm@11.10.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --prod --filter @home-hub/api...

COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
COPY packages/database/tsconfig.json packages/database/tsconfig.json
COPY packages/database/src packages/database/src
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/src packages/shared/src

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV API_PORT=3000

WORKDIR /app

COPY --from=dependencies --chown=node:node /app /app

USER node
WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "--import", "tsx", "src/index.ts"]
