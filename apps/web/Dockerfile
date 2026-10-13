# Build context is the repo root: docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@10.30.3
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @tectonic/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @tectonic/shared build && pnpm --filter @tectonic/web build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
