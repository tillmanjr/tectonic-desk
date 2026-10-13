# Tectonic Desk live build: Ingest

Date: 2026-10-13
Status: approved

## Context

Sub-project 2 of the live build. Foundation delivered the Fastify server, the
`events` and `mechanisms` tables, and the repository layer. Ingest fills those
tables from USGS and keeps them current.

Verified against live USGS responses on 2026-10-13:

- Feed features carry `properties` (`mag`, `place`, `time` and `updated` as
  millisecond epochs, `felt`, `cdi`, `mmi`, `alert`, `status`, `tsunami` as
  0/1, `sig`, `net`, `code`, `types` as a comma-wrapped list, `magType`,
  `type`, `title`) and `geometry.coordinates` as `[lon, lat, depthKm]`.
- The detail document adds `properties.products`, keyed by product type.
  `moment-tensor` and `focal-mechanism` products have `source`, `code`,
  `status` (`UPDATE` or `DELETE`), `updateTime` (ms), `preferredWeight`, and
  string-valued `properties` (`nodal-plane-1-strike`, `t-axis-azimuth`,
  `tensor-mrr`, `scalar-moment`, `percent-double-couple`, `derived-depth`,
  `derived-magnitude`, `derived-magnitude-type`, and so on).
- One event can carry several moment tensors from different networks.
- Some `nc` tensors publish axes but no nodal planes.
- First-motion `focal-mechanism` products publish planes only.
- 90 days of global M2.5+ is about 5,600 events; the fdsnws cap is 20,000 per
  query.

## Decisions

| Topic        | Choice                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Live feeds   | `2.5_day.geojson` every 5 min, `2.5_week.geojson` every hour                                                                 |
| Backfill     | fdsnws query, global M2.5+, 90 days, CLI re-runnable with `--days`                                                           |
| Detail fetch | only events whose feed `types` advertise `moment-tensor` or `focal-mechanism`, re-fetched when the event's `updated` changes |
| Process      | scheduler runs inside the server behind `INGEST_ENABLED`; CLI for one-off runs                                               |
| Retention    | nothing is deleted; history accumulates past the feed windows                                                                |
| Architecture | pipeline modules: client, parsers, sync, scheduler, runs table                                                               |

## 1. Schema (migration 0001)

`events` gains:

| Column                   | Type                         | Notes                                                               |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------- |
| `event_type`             | text                         | USGS `type`: `earthquake`, `quarry blast`, `explosion`, ...         |
| `types`                  | text[] not null default '{}' | product types advertised by the feed, split from the comma list     |
| `detail_checked_updated` | timestamptz                  | the event `updated` value at the last products fetch; null if never |

New table `ingest_runs`:

| Column                                                | Type                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `id`                                                  | serial PK                                                       |
| `kind`                                                | text, check in (`feed_day`, `feed_week`, `backfill`, `details`) |
| `started_at`                                          | timestamptz not null                                            |
| `finished_at`                                         | timestamptz                                                     |
| `ok`                                                  | boolean                                                         |
| `events_inserted`, `events_updated`, `events_skipped` | integer not null default 0                                      |
| `details_fetched`, `mechanisms_upserted`              | integer not null default 0                                      |
| `error`                                               | text                                                            |
| `detail`                                              | jsonb not null default '{}' (source URL, window, limits)        |

Index: `ingest_runs(kind, started_at desc)`.

The shared `Event` type gains `eventType: string | null` and `types: string[]`.
`StoredEvent` gains `detailCheckedUpdated: Date | null`.

## 2. Shared mechanism math

`packages/shared/src/mechanism/planes.ts` ports `axesToPlanes` and
`planeFrom` from `quake/bb.js`: given T and P axis azimuth and plunge, return
both nodal planes as `{ strike, dip, rake }`. Unit tests compare against the
nodal planes USGS published for events in the prototype's catalog, to within
one degree. `packages/shared` gains vitest and a `test` script; its coverage
threshold is 100% as well.

## 3. USGS client and parsers (`apps/server/src/usgs/`)

### Client

- `createUsgsClient({ fetch, baseUrl, userAgent, timeoutMs })` returns
  `fetchFeed(kind: "2.5_day" | "2.5_week")`, `fetchDetail(eventId)`, and
  `fetchQuery(params)`.
- Every request sets `User-Agent` and `Accept: application/json`, aborts after
  `timeoutMs` (default 15,000), and raises `UsgsHttpError { status, url }` on a
  non-2xx response.
- Responses are validated with permissive zod schemas that check only the
  fields the parsers use and pass everything else through unchanged.
- Feed URL: `{baseUrl}/earthquakes/feed/v1.0/summary/{kind}.geojson`.
  Detail URL: `{baseUrl}/fdsnws/event/1/query?eventid={id}&format=geojson`.
  Query URL: `{baseUrl}/fdsnws/event/1/query?format=geojson&...`.

### Parsers (pure)

- `featureToEvent(feature): Event`. Epoch ms to `Date`; coordinates to
  `latitude`, `longitude`, `depthKm` (null when absent); `tsunami` 0/1 to
  boolean; `types` from the comma-wrapped list with empties removed; `raw`
  is the whole `properties` object.
- `productToMechanism(eventId, kind, product): Mechanism | null`. Returns
  null when `status` is `DELETE`. Numeric properties are parsed with
  `Number()` and become null when missing, empty, or NaN.
  `percentDc` is divided by 100 when greater than 1. `depthKm` is
  `derived-depth`, falling back to `depth`. `mw` is `derived-magnitude` when
  `derived-magnitude-type` starts with `Mw` (case-insensitive), else null.
  When all six plane values are absent and both T and P axes are present, the
  planes come from the shared math and `planesReconstructed` is true.
  `productUpdated` is `updateTime`. `preferred` is false here; sync sets it.
- `pickPreferred(mechanisms)`: for each `kind`, the entry with the highest
  `preferredWeight` gets `preferred: true`. Ties go to the latest
  `productUpdated`.

## 4. Sync (`apps/server/src/ingest/`)

All functions take an `IngestContext { db, usgs, log, now }` so tests can
inject a stub client and clock.

- `syncFeed(ctx, kind)`: open an `ingest_runs` row, fetch and parse the feed,
  `upsertEvents`, then `syncDetails`, then close the row with counts and
  `ok: true`. Any thrown error closes the row with `ok: false` and the
  message, and is rethrown.
- `syncDetails(ctx, { limit = 50, concurrency = 2 })`: select candidate
  events where `types && '{moment-tensor,focal-mechanism}'` and
  `detail_checked_updated is null or detail_checked_updated < updated`,
  ordered by `time desc`, limited. For each candidate, fetch the detail,
  parse every `moment-tensor` and `focal-mechanism` product, apply
  `pickPreferred`, upsert the survivors, delete rows whose product reported
  `DELETE` (by event, kind, source, code), and set `detail_checked_updated`
  to the event's current `updated` in one transaction. A failed candidate is
  logged with its id and skipped; it remains a candidate. Returns
  `{ candidates, fetched, failed, mechanismsUpserted }`.
- `backfill(ctx, { days, window = 30 })`: for each window from `now - days`
  forward, `fetchQuery` with `minmagnitude=2.5`, `orderby=time-asc`,
  `limit=20000`. If a page returns exactly the cap, split the window in half
  and recurse. Upsert each page. Then loop `syncDetails` with `limit: 200`
  until `candidates` is 0. Records one `backfill` run row.
- Repository additions: `listDetailCandidates(db, limit)`,
  `markDetailChecked(db, id, updated)`, `deleteMechanism(db, key)`, and an
  `ingestRuns` repository with `startRun`, `finishRun`.

## 5. Scheduler and process shape

- `startScheduler(ctx, { dayMs, weekMs })`: runs `feed_day` immediately,
  then every `dayMs`; runs `feed_week` every `weekMs` starting one `weekMs`
  after start. Ticks are chained with `setTimeout`, not `setInterval`. If a
  run is in progress when a tick fires, that tick is skipped and logged at
  warn. Errors from a run are logged and do not stop the scheduler. Returns
  `{ stop(): Promise<void> }` which clears timers and awaits any in-flight
  run.
- `index.ts` starts the scheduler when `INGEST_ENABLED` is true and registers
  `stop` in Fastify's `onClose` hook.
- New config, all optional: `INGEST_ENABLED` (boolean, default true),
  `INGEST_DAY_INTERVAL_MS` (default 300000, min 60000),
  `INGEST_WEEK_INTERVAL_MS` (default 3600000, min 300000), `USGS_BASE_URL`
  (default `https://earthquake.usgs.gov`), `USGS_USER_AGENT` (default
  `tectonic-desk/0.0 (+local)`).
- CLI `apps/server/src/ingest-cli.ts` with `node:util` `parseArgs`:
  `pnpm ingest feed day`, `pnpm ingest feed week`, `pnpm ingest details`,
  `pnpm ingest backfill --days 90`. Exits non-zero on failure. Excluded from
  coverage like the other entry points.

## 6. Error handling

- HTTP and parse failures inside a feed or backfill run fail that run,
  recorded in `ingest_runs`. The scheduler keeps going.
- Detail failures are per event and never fail the run.
- Malformed individual features (schema validation failure) are logged with
  the feature id and skipped; the rest of the feed still loads.

## 7. Testing

- Fixtures under `apps/server/test/fixtures/usgs/`: a trimmed `2.5_day`
  feed, a `us` detail with one Mww tensor, the `nc75442207` detail with two
  tensors and one first-motion product, and a product with `DELETE` status.
- Unit tests for the client (URL building, headers, timeout, HTTP error,
  schema rejection) with a stub fetch; for each parser rule listed above;
  for `pickPreferred`; for the scheduler with fake timers including the
  overlap guard and stop while in flight.
- Integration tests with Testcontainers for `syncFeed`, `syncDetails`
  (candidate selection, DELETE handling, stamp update, per-event failure),
  `backfill` (window split on cap), and the runs table.
- Coverage thresholds remain 100% on both `apps/server/src` and
  `packages/shared/src`.

## Out of scope

API routes exposing runs or events, changes to the health route, volcano or
space-weather sources, user-defined regions, and any change to `quake/`.
