# Tectonic Desk

An earth-sciences dashboard: earthquakes now, volcanoes next, space weather considered after that.
Written for a reader with formal geology training.

## Layout

- `apps/server` Fastify + Drizzle + Postgres (TypeScript), with the USGS ingest
- `apps/web` Vue 3 + Vite front end (the port of the prototype)
- `packages/shared` domain types and focal-mechanism math shared by server and web
- `quake/` the original static prototype, frozen as historical reference
- `deploy/` nginx config for the production image
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
pnpm dev                          # web on http://localhost:5173, API on http://127.0.0.1:3000
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

## Front end

`apps/web` is the Vue 3 + Vite port of the prototype. `pnpm dev` runs the server and Vite together;
the page is at http://localhost:5173 and `/api` is proxied to port 3000.

- `/` is the Global view, `/wc` the West Coast view; `?event=<id>` opens the detail panel, so links
  are shareable.
- The status line polls `GET /api/status` every minute and refetches the catalog when a feed sync
  has landed. It turns amber after 30 minutes without a sync and red when the API is unreachable.
- Theme follows the system by default; the toggle cycles auto, light, dark.
- The focal-mechanism math lives in `packages/shared`; only the canvas raster is in the web app.
- The filter bar above the map narrows magnitude and depth (inclusive, either bound optional) for
  the map, catalog and charts; the summary tiles and major events stay unfiltered. Filters live in
  the URL (`minMag`, `maxMag`, `minDepth`, `maxDepth`); the magnitude minimum cannot go below the
  view's floor, and the b-value's Mc rises with it.
- A date range (from, to; either optional, inclusive calendar days) loads that window from the
  server for the map, catalog and charts; the dates are bounded to the last 90 days. The header's "Times" button switches every date and time on the page, and the way the
  date filter is read, between UTC (default) and the browser's zone; it is kept in the URL as
  `tz=local`.
- "Animate" on the map toolbar replays the loaded window: a tracking clock starts at the day
  before the window's first day with an empty map and adds the filtered events as it passes their
  origin times; set seconds per day, start, pause, step a day either way, close.
- The map is locked by default: wheel and drag scroll the page; the buttons and clicking an event
  still zoom. The mouse icon in the map's top-right corner toggles the lock; a red slash means
  locked.
- Subduction teeth point toward the overriding plate, read from Bird's `/` and `\` boundary titles;
  the plate tooltip says which plate subducts under which.

## Deployment

`docker compose --profile prod up --build -d` builds and runs Postgres, the API (with ingest) and
nginx serving the built front end on http://localhost:8080 (`/api` is proxied). The server runs
migrations on start. `docker compose --profile prod down` stops everything; the data volume is kept.

## Scripts

| Script                          | What it does                                                   |
| ------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                      | server and web together (Vite on 5173, API on 3000)            |
| `pnpm dev:server` / `dev:web`   | one of them                                                    |
| `pnpm test`                     | all tests; integration tests need Docker (Testcontainers)      |
| `pnpm test:coverage`            | tests with 100% thresholds on server and shared                |
| `pnpm lint` / `pnpm format`     | ESLint (type-aware) / Prettier                                 |
| `pnpm typecheck`                | tsc across the workspace                                       |
| `pnpm build`                    | compile shared, server and web to their `dist/`                |
| `pnpm db:generate`              | generate a migration from `apps/server/src/db/schema.ts`       |
| `pnpm db:migrate`               | apply migrations to `DATABASE_URL`                             |
| `pnpm db:up` / `pnpm db:down`   | start / stop the compose Postgres                              |
| `pnpm ingest feed day\|week`    | one feed sync, including detail fetches                        |
| `pnpm ingest details`           | one detail pass over pending candidates (`--limit N`)          |
| `pnpm ingest backfill --days N` | load N days of global M2.5+ history, then drain detail fetches |
