# Tectonic Desk

An earth-sciences dashboard: earthquakes now, volcanoes next, space weather considered after that.
Written for a reader with formal geology training.

## Layout

- `apps/server` Fastify + Drizzle + Postgres (TypeScript)
- `apps/web` placeholder for the Vue 3 + Vite front end
- `packages/shared` domain types shared by server and web
- `quake/` the original static prototype, frozen as historical reference
- `docs/superpowers` design specs and implementation plans

## Prerequisites

Node 24, pnpm 10, Docker Desktop.

## Setup

```bash
pnpm install
cp .env.example .env     # Postgres is exposed on host port 5433
pnpm db:up
pnpm db:migrate
pnpm dev                 # http://127.0.0.1:3000/api/health
```

## Scripts

| Script                        | What it does                                              |
| ----------------------------- | --------------------------------------------------------- |
| `pnpm test`                   | all tests; integration tests need Docker (Testcontainers) |
| `pnpm test:coverage`          | tests with 100% thresholds on `apps/server/src`           |
| `pnpm lint` / `pnpm format`   | ESLint (type-aware) / Prettier                            |
| `pnpm typecheck`              | tsc across the workspace                                  |
| `pnpm build`                  | compile `packages/shared` then `apps/server` to `dist/`   |
| `pnpm db:generate`            | generate a migration from `apps/server/src/db/schema.ts`  |
| `pnpm db:migrate`             | apply migrations to `DATABASE_URL`                        |
| `pnpm db:up` / `pnpm db:down` | start / stop the compose Postgres                         |
