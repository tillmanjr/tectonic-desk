# Build context is the repo root: docker build -f apps/server/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@10.30.3
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @tectonic/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @tectonic/shared build && pnpm --filter @tectonic/server build
RUN pnpm --filter @tectonic/server deploy --prod --legacy /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
EXPOSE 3000
CMD ["sh", "-c", "node dist/db/migrate-cli.js && node dist/index.js"]
