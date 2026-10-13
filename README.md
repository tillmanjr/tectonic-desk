# Tectonic Desk

An earth-sciences dashboard: earthquakes now, volcanoes next, space weather considered after that.
Written for a reader with formal geology training.

## Layout

- `apps/server` Fastify + Drizzle + Postgres (TypeScript), with the USGS ingest
- `apps/web` placeholder for the Vue 3 + Vite front end
- `packages/shared` domain types and focal-mechanism math shared by server and web
- `quake/` the original static prototype, frozen as historical reference
- `docs/superpowers` design specs and implementation plans

## Prerequisites

Node 24, pnpm 10, Docker Desktop.

## Setup

```bash
pnpm install
cp .env.example .env              # Postgres is exposed on host port 5433
pnpm db:up
pnpm db:migrate
pnpm ingest backfill --days 90    # optional: load history (several minutes)
pnpm dev                          # http://127.0.0.1:3000/api/health
```

## Ingest

The server polls USGS while it runs (`INGEST_ENABLED`, default true):

- `2.5_day.geojson` every 5 minutes and `2.5_week.geojson` every hour. Global M2.5+ covers
  both the Global and West Coast views; the weekly pass catches late revisions. Events are
  upserted by id and only overwritten when USGS's `updated` stamp is newer.
- Events whose feed entry advertises a `moment-tensor` or `focal-mechanism` product get a
  detail fetch, re-done whenever the event is revised. Every product is stored; the heaviest
  per kind is marked preferred. Nodal planes are reconstructed from T and P axes when a
  network publishes only axes.
- Nothing is deleted. History accumulates past the feed windows. Every run is recorded in
  `ingest_runs`.

Set `INGEST_ENABLED=false` on a second API instance so only one process polls.

## API

All routes return JSON. Bad input is 400 `{ error, issues: [{ path, message }] }`, an unknown
id or path is 404 `{ error }`, anything else is 500 `{ error }`. Successful responses carry a
short `Cache-Control`.

| Route                 | Returns                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/health`     | `{ status, db }`, 503 when the database does not answer                                    |
| `GET /api/regions`    | the view presets: id, name, subtitle, minMag, days, bbox                                   |
| `GET /api/events`     | `{ events, count, truncated, query }`; each event carries its preferred mechanism per kind |
| `GET /api/events/:id` | the event with every mechanism product and the raw USGS properties as `usgs`               |
| `GET /api/status`     | catalog totals, latest ingest run per kind, last successful feed time                      |
| `GET /api/runs`       | ingest run history, `?kind=feed_day\|feed_week\|backfill\|details&limit=N`                 |
| `GET /api/geo/:name`  | `plates`, `wc-land`, `wc-states` from `apps/server/data/geo`, with an ETag                 |

`GET /api/events` filters: `since` and `until` (ISO 8601 date-time or `YYYY-MM-DD`; `since`
defaults to seven days ago), `minMag`, `bbox=minLon,minLat,maxLon,maxLat` (minLon > maxLon
crosses the antimeridian), `limit` (default 500, max 5000). Dates in responses are ISO 8601 UTC.
Types for every response are in `packages/shared/src/api.ts`.

## Scripts

| Script                          | What it does                                                   |
| ------------------------------- | -------------------------------------------------------------- |
| `pnpm test`                     | all tests; integration tests need Docker (Testcontainers)      |
| `pnpm test:coverage`            | tests with 100% thresholds on server and shared                |
| `pnpm lint` / `pnpm format`     | ESLint (type-aware) / Prettier                                 |
| `pnpm typecheck`                | tsc across the workspace                                       |
| `pnpm build`                    | compile `packages/shared` then `apps/server` to `dist/`        |
| `pnpm db:generate`              | generate a migration from `apps/server/src/db/schema.ts`       |
| `pnpm db:migrate`               | apply migrations to `DATABASE_URL`                             |
| `pnpm db:up` / `pnpm db:down`   | start / stop the compose Postgres                              |
| `pnpm ingest feed day\|week`    | one feed sync, including detail fetches                        |
| `pnpm ingest details`           | one detail pass over pending candidates (`--limit N`)          |
| `pnpm ingest backfill --days N` | load N days of global M2.5+ history, then drain detail fetches |
