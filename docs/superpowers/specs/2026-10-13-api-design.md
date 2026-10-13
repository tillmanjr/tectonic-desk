# Tectonic Desk live build: API

Date: 2026-10-13
Status: approved

## Context

Sub-project 3 of the live build. Foundation delivered the Fastify server and
the schema; Ingest fills `events`, `mechanisms`, and `ingest_runs` from USGS
and keeps them current. The API exposes that data to the Vue front end
(sub-project 4), which ports the prototype in `quake/`.

What the prototype needs, read from `quake/template.html`:

- One event list per region view. The summary strip (count, largest, deepest,
  mechanisms retrieved, events in the last 24 h), the major-events cards, the
  time and depth charts, and the sequence notes are all computed client-side
  from that list.
- Each listed event needs its preferred mechanism so the map and the cards can
  draw a beachball without a second request.
- The detail panel needs every mechanism product (planes, axes, tensor,
  scalar moment, Mw, centroid depth, double-couple fraction, source network,
  reconstructed flag) and the impact fields (`sig`, `felt`, `mmi`, `alert`,
  `tsunami`).
- The header replaces "static snapshot, retrieved at" with "live, updated N
  minutes ago", which needs the last successful feed time.
- The map draws PB2002 plate boundaries and, for the West Coast view, Natural
  Earth land and state outlines (`plates.json`, `wc_land.json`,
  `wc_states.json`).

## Decisions

| Topic         | Choice                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| List shape    | generic filters on `GET /api/events` plus `GET /api/regions` returning the two presets                        |
| Mechanisms    | the preferred product per kind inline on every listed event; all products on the detail route                 |
| Summaries     | computed by the client from the list, as in the prototype                                                     |
| Status        | `GET /api/status` with catalog totals and the latest ingest run per kind                                      |
| Runs history  | `GET /api/runs` for diagnostics                                                                               |
| Geo data      | the three prototype files served from the API with a content ETag                                             |
| Static web    | nginx serves `apps/web` and proxies `/api`; the server adds no CORS, static, or compression plugins           |
| Types         | DTO types in `packages/shared/src/api.ts`, derived from the domain types; zod request parsing in the server   |
| Errors, cache | 400 `{ error, issues }` for bad input, 404 `{ error }`, 500 `{ error }`; short `Cache-Control` on every route |

## 1. Shared API types (`packages/shared/src/api.ts`)

Type-only module, no runtime code, so `packages/shared` keeps zero
dependencies.

- `Json<T>`: mapped type turning `Date` into `string` and `Date | null` into
  `string | null`. Dates are serialised as ISO 8601 UTC.
- `ApiMechanism = Omit<Json<StoredMechanism>, "raw">`.
- `ApiEvent = Omit<Json<StoredEvent>, "raw" | "firstSeen" | "lastSeen" | "detailCheckedUpdated"> & { mechanisms: ApiMechanism[] }`.
  On the list route `mechanisms` holds at most one `mt` and one `fm`, the
  preferred product of each kind.
- `ApiEventDetail = Omit<Json<StoredEvent>, "raw"> & { mechanisms: ApiMechanism[]; usgs: Record<string, unknown> }`.
  `mechanisms` holds every product; `usgs` is the raw feed `properties`.
- `ApiEventQuery { since: string; until: string | null; minMag: number | null; bbox: BBox | null; limit: number }`,
  the filters as applied after defaults.
- `ApiEventList { events: ApiEvent[]; count: number; truncated: boolean; query: ApiEventQuery }`.
- `RegionId = "global" | "wc"`,
  `ApiRegion { id: RegionId; name: string; subtitle: string; minMag: number; days: number; bbox: BBox | null }`.
- `RunKind = "feed_day" | "feed_week" | "backfill" | "details"` moves here
  from the server; the schema and the ingest repository import it.
- `ApiRun { id: number; kind: RunKind; startedAt: string; finishedAt: string | null; ok: boolean | null; eventsInserted: number; eventsUpdated: number; eventsSkipped: number; detailsFetched: number; mechanismsUpserted: number; error: string | null; detail: Record<string, unknown> }`.
- `ApiStatus { generatedAt: string; events: { total: number; newest: string | null; oldest: string | null; withMechanism: number }; mechanisms: { total: number }; runs: Record<RunKind, ApiRun | null>; lastSuccessfulFeed: string | null }`.
- `ApiIssue { path: string; message: string }`, `ApiError { error: string; issues?: ApiIssue[] }`.

## 2. Routes

Every response is JSON. Every successful response carries
`Cache-Control: public, max-age=N` with N from the table.

| Route                 | Cache | Response             |
| --------------------- | ----- | -------------------- |
| `GET /api/health`     | none  | unchanged            |
| `GET /api/regions`    | 60    | `ApiRegion[]`        |
| `GET /api/events`     | 60    | `ApiEventList`       |
| `GET /api/events/:id` | 60    | `ApiEventDetail`     |
| `GET /api/status`     | 15    | `ApiStatus`          |
| `GET /api/runs`       | 15    | `{ runs: ApiRun[] }` |
| `GET /api/geo/:name`  | 86400 | the file body        |

### `GET /api/regions`

The presets, defined in `apps/server/src/regions.ts`:

| id       | name          | subtitle             | minMag | days | bbox (lon, lat)                |
| -------- | ------------- | -------------------- | ------ | ---- | ------------------------------ |
| `global` | Global        | M4.5+ · past 7 days  | 4.5    | 7    | null                           |
| `wc`     | West Coast US | M2.5+ · past 30 days | 2.5    | 30   | −136 to −104 lon, 27 to 53 lat |

User-defined regions come later and will add rows to this response without
changing its shape.

### `GET /api/events`

Query parameters, all optional:

| Name     | Format                                          | Default           |
| -------- | ----------------------------------------------- | ----------------- |
| `since`  | ISO 8601 date-time with offset, or `YYYY-MM-DD` | now minus 7 days  |
| `until`  | same                                            | none (open-ended) |
| `minMag` | number in [−2, 10]                              | none              |
| `bbox`   | `minLon,minLat,maxLon,maxLat` (GeoJSON order)   | none              |
| `limit`  | integer in [1, 5000]                            | 500               |

Rules:

- `until` earlier than `since` is a 400.
- `bbox` latitudes must lie in [−90, 90] with `minLat <= maxLat`; longitudes
  in [−180, 180]. `minLon > maxLon` means the box crosses the antimeridian,
  matching `listEvents`.
- Events are ordered by `time desc, id desc`, newest first.
- `truncated` is true when the result filled `limit`; the client should
  narrow the window or raise the limit.
- `count` is `events.length`.
- Each event's `mechanisms` holds the rows with `preferred = true`, fetched
  in one `in (...)` query for the returned ids.

### `GET /api/events/:id`

404 `{ error: "event not found" }` when the id is unknown. Otherwise the
`ApiEventDetail` with all mechanism rows ordered by `kind, preferred desc,
source, code` and the raw USGS properties under `usgs`.

### `GET /api/status`

- `events.total`, `events.newest` and `events.oldest` (max and min of `time`),
  `events.withMechanism` (distinct `event_id` in `mechanisms`),
  `mechanisms.total`.
- `runs`: the latest run per kind by `started_at`, null for a kind that has
  never run.
- `lastSuccessfulFeed`: max `finished_at` over runs with `ok = true` and kind
  `feed_day` or `feed_week`; null if none.
- `generatedAt`: the server clock.

### `GET /api/runs`

| Name    | Format                           | Default |
| ------- | -------------------------------- | ------- |
| `kind`  | one of the four `RunKind` values | all     |
| `limit` | integer in [1, 500]              | 50      |

Ordered by `started_at desc, id desc`.

### `GET /api/geo/:name`

`name` is one of `plates`, `wc-land`, `wc-states`. The files are copied from
`quake/` into `apps/server/data/geo/` (`plates.json`, `wc-land.json`,
`wc-states.json`) with a `README.md` recording provenance: PB2002 (Bird 2003)
via `fraxen/tectonicplates`, merged by step class; Natural Earth 10m clipped to
lon −136..−104, lat 27..53. They are read once when the app is built, with a
SHA-1 content hash as the ETag. A request whose `If-None-Match` matches gets
304 with no body. Unknown names are 404. `quake/` is not touched.

## 3. Server modules

| Path                                          | Responsibility                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/server/src/regions.ts`                  | `REGIONS: readonly ApiRegion[]`                                                      |
| `apps/server/src/api/errors.ts`               | `HttpError`, `badRequest(issues)`, `notFound(message)`, `registerErrorHandlers(app)` |
| `apps/server/src/api/schemas.ts`              | zod schemas for the events query, the runs query, the event id; `parseOrThrow`       |
| `apps/server/src/api/serialize.ts`            | `toApiEvent`, `toApiEventDetail`, `toApiMechanism`, `toApiRun`, `isoOrNull`          |
| `apps/server/src/api/cache.ts`                | `cacheFor(reply, seconds)`                                                           |
| `apps/server/src/geo/assets.ts`               | `loadGeoAssets(dir)` returning `Map<name, { body, etag }>`                           |
| `apps/server/src/routes/regions.ts`           | `GET /api/regions`                                                                   |
| `apps/server/src/routes/events.ts`            | `GET /api/events`, `GET /api/events/:id`                                             |
| `apps/server/src/routes/status.ts`            | `GET /api/status`                                                                    |
| `apps/server/src/routes/runs.ts`              | `GET /api/runs`                                                                      |
| `apps/server/src/routes/geo.ts`               | `GET /api/geo/:name`                                                                 |
| `apps/server/src/app.ts`                      | registers error handlers and routes; decorates `db`, `now`, `geo`                    |
| `apps/server/src/repositories/events.ts`      | `listEventsWithPreferred`, `catalogStats`                                            |
| `apps/server/src/repositories/mechanisms.ts`  | `listPreferredMechanisms(db, eventIds)`                                              |
| `apps/server/src/repositories/ingest-runs.ts` | `listRuns`, `latestRuns`, `lastSuccessfulFeedAt`                                     |

`buildApp({ db, logger, now, geoDir })`: `now` defaults to `() => new Date()`
and drives the default `since` and `generatedAt`; `geoDir` defaults to
`apps/server/data/geo` resolved from the module URL, so it works from `src`
under tsx and from `dist` after build.

Error handling: route handlers throw `HttpError` (status, message, optional
issues). The app-level error handler returns `{ error, issues? }` with that
status; any other error is logged and returned as 500 `{ error: "internal
error" }`. A not-found handler returns 404 `{ error: "not found" }` for
unknown paths so every error body has one shape.

`getEvent` now orders mechanisms by `kind, preferred desc, source, code` so
the detail response is stable.

## 4. Testing

- Unit, no Docker: schema parsing for every rule in section 2 (defaults, both
  date formats, until before since, bbox shapes and ranges, limit bounds,
  array-valued query keys, run kinds); serializers (ISO strings, `raw`
  dropped, `usgs` present on detail); regions; `loadGeoAssets` (three
  entries, quoted ETag, throws on a missing directory); geo route (200 with
  headers, 304 on matching `If-None-Match`, 404 unknown name); error handlers
  (400 shape without touching the database, 404 for an unknown path, 500 when
  a repository rejects).
- Integration, Testcontainers: events list (default window from the injected
  clock, each filter, antimeridian bbox, limit and `truncated`, preferred-only
  mechanisms, cache header); event detail (all products, `usgs`, 404); status
  (empty catalog gives zeros and nulls; seeded catalog and runs give counts,
  latest per kind, last successful feed ignoring failed runs); runs (order,
  kind filter, limit); new repository functions.
- Coverage thresholds stay at 100% on `apps/server/src` and
  `packages/shared/src`.

## 5. Documentation

README gains an API section listing the routes and query parameters.
CLAUDE.md gains an API section with the DTO rule (shared `api.ts` derived
from domain types; dates as ISO strings; `raw` never leaves the server except
as `usgs` on the detail route) and the error shape.

## Out of scope

Authentication, rate limiting, CORS, compression, OpenAPI documents,
server-side summaries, user-defined regions, pagination cursors, and any
change to `quake/` or the ingest pipeline.
