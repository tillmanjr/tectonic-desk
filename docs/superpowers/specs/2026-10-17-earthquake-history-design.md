# Earthquake history: catalogue backfill, ledger and aggregates (server)

Date: 2026-10-17. Status: approved. Research: `docs/research/earthquake-history.md` (branch
`research/earthquake-history`, PR pending). Companion spec to follow: the long-range UI
(magnitude floor, overview mode, era marks), which consumes the endpoints defined here.

## Goal

Load ComCat history into the existing `events` and `mechanisms` tables, newest first, in a way
that is resumable, idempotent and polite to USGS; record which spans of the catalogue are
complete and frozen so they are never refetched or rewritten; stop the `last_seen` churn that
doubles the table on disk; and give the API the aggregate endpoints a century-scale UI needs
(count, time summary, grid density, coverage). Nothing in the current UI changes behaviour: it
still asks for at most 90 days and 2,000 events.

Recommended first load (scope D of the research): global M2.5+ from 1900 plus everything
ComCat holds before 1900, about 1.08 million events, 1.4-2.9 GB, run once on the droplet.

## Decisions

| Topic | Choice |
| --- | --- |
| Direction | Windows are walked from the newest to the oldest, so the catalogue is always contiguous from today back to a moving edge. |
| Window grid | Calendar months (UTC) from 1970-01-01 on, calendar years before. Windows are never clipped to the requested range: the window containing `--from` or `--to` is loaded whole, so every window has one canonical identity. |
| Frozen tracking | A ledger table `catalog_windows` holds one row per completed window and scope. A window is written to the ledger only when it ended at least 30 days before the run started (`SETTLE_DAYS`); younger windows are loaded on every run because USGS still revises them. The backfill skips a window the ledger covers unless `--force`. Nothing else in the system touches rows older than the week feed, so a ledgered window is fixed. |
| Partitioning | No. At about one million rows the time, lat/lon and magnitude indexes already prune the queries; the ledger, not table layout, expresses immutability; drizzle-kit cannot express partitions and the primary key would have to carry the partition key. Revisit at 2.5 million rows (scope E). |
| `last_seen` churn | `upsertEvents` bumps `last_seen` only on rows whose stored value is older than one hour. |
| Id aliases | An incoming event whose `ids` list names other stored ids replaces them: those rows (and their mechanisms, by cascade) are deleted and counted as `merged`. |
| Politeness | A pause between page requests (default 1,000 ms) and exponential back-off with up to 5 attempts on 429, 5xx, timeouts and network errors. Node's fetch already negotiates gzip. |
| Detail phase | Candidates for the backfill are fetched largest magnitude first; `--skip-details` leaves the backlog to the feeds' detail pass, which keeps draining 50 per feed run. |
| Aggregates | Computed live from `events` with the filters of `GET /api/events`, cached 300 s. A materialised summary is the fallback if a century query exceeds about a second on the droplet; not built now. |
| Process | One `ingest_runs` row of kind `backfill` per CLI run, with window progress in `detail`; per-window checkpoints are the ledger rows. |

## 1. Schema (migration 0003)

New table `catalog_windows`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `from_time` | timestamptz not null | window start, inclusive |
| `to_time` | timestamptz not null | window end, exclusive |
| `min_mag` | double precision | the floor the window was loaded with; null = all magnitudes |
| `bbox` | text | `minLon,minLat,maxLon,maxLat` as the API spells it; null = global |
| `events` | integer not null | events returned by USGS for the window (after dedupe) |
| `pages` | integer not null | page requests made |
| `run_id` | integer not null references `ingest_runs(id)` | the run that completed it |
| `completed_at` | timestamptz not null | |

Unique constraint `catalog_windows_key_uq` on `(from_time, to_time, min_mag, bbox)` with
`NULLS NOT DISTINCT` (Postgres 15+; production runs 16). Index on `from_time`.

`events` gains `events_mag_time_idx (mag, time)` for "M at least x over a long span" queries,
which the time index alone answers by scanning the whole span.

`RunKind` is unchanged.

## 2. Repository: `repositories/catalog-windows.ts`

```ts
export interface WindowKey { from: Date; to: Date; minMag: number | null; bbox: string | null }
export interface WindowRecord extends WindowKey { events: number; pages: number; runId: number; completedAt: Date }

/** True when a completed row has the same bounds, a floor at or below `minMag` (null covers all) and a bbox that is null or equal. */
export function windowCovered(db: Db, key: WindowKey): Promise<boolean>
/** Upserts on the unique key, replacing counts, run and completion time. */
export function recordWindow(db: Db, rec: WindowRecord): Promise<void>
/** Contiguous spans of completed windows per (minMag, bbox), oldest first: windows merge when one's `to` equals the next's `from`. */
export function coverageSpans(db: Db): Promise<CoverageSpan[]>
```

`CoverageSpan` is `{ from, to, minMag, bbox, events, windows }` where `events` and `windows`
are sums over the merged windows. The bbox string compares textually; the CLI formats it from
the parsed numbers, so the same box always spells the same.

## 3. `upsertEvents` changes (`repositories/events.ts`)

- `UpsertResult` gains `merged: number`.
- Before inserting a chunk, collect every alias from each event's `raw.ids` (a comma-wrapped
  string such as `,ci12345,us7000abcd,`), excluding the event's own id and any id that is
  itself in the chunk. Delete `events` rows with those ids and count them. Mechanisms cascade.
- The `last_seen` update after each chunk adds `and last_seen < now() - interval '1 hour'`.
  Rows inserted by the same statement are not touched (their default is `now()`).
- Doc comment and the `add` helpers in `feed.ts` and `backfill.ts` carry the new field.
  `ingest_runs` does not store `merged`; the run log line does.

`listDetailCandidates(db, limit, order = "time")` accepts `order: "time" | "mag"`; `"mag"`
sorts by `mag desc nulls last, time desc, id desc`.

## 4. USGS client (`usgs/client.ts`)

`QueryParams` becomes `{ starttime; endtime; minmagnitude?: number; bbox?: BBox; limit }`.
A missing `minmagnitude` sends no parameter. A bbox sends `minlatitude`, `maxlatitude`,
`minlongitude`, `maxlongitude`; a box crossing the antimeridian (`minLon > maxLon`) is
rejected by the CLI (USGS does not support it and the two prototype views do not need it).
No other client change: retries live in the backfill, not the client, so the feeds keep
their fail-fast behaviour.

## 5. Backfill (`ingest/backfill.ts`, pure helpers in `ingest/windows.ts`)

```ts
export interface BackfillOptions {
  from: Date;
  to: Date;
  minMagnitude: number | null;   // null = all magnitudes
  bbox?: BBox;
  force?: boolean;               // ignore the ledger
  skipDetails?: boolean;
  pageLimit?: number;            // default 20_000
  pauseMs?: number;              // default 1_000 between page requests
  settleDays?: number;           // default 30
  sleep?: (ms: number) => Promise<void>; // injectable; default setTimeout
}
export interface BackfillResult {
  runId: number;
  windows: { loaded: number; skipped: number; frozen: number };
  pages: number;
  events: UpsertResult;
  details: DetailsResult;
}
```

`ingest/windows.ts`:

- `MONTHLY_FROM = Date.UTC(1970, 0, 1)`.
- `windowsBetween(from, to): { from: Date; to: Date }[]` returns the canonical windows that
  intersect `[from, to)`, **newest first**: months at or after `MONTHLY_FROM`, years before.
- `bboxKey(bbox: BBox | undefined): string | null` formats `minLon,minLat,maxLon,maxLat`.

Run:

1. `startRun(db, "backfill", { from, to, minMagnitude, bbox, force, skipDetails }, now)`.
2. For each window newest first:
   - `key = { from, to, minMag, bbox: bboxKey }`. If not `force` and `windowCovered`, count
     it skipped, log at info and continue.
   - Page the window as today (time-asc cursor restarting at the last event's time, throwing
     when the cursor cannot advance). Each page request goes through `withRetry` (section 6)
     and is followed by `sleep(pauseMs)`.
   - If `window.to <= runStart - settleDays`, `recordWindow` and count it frozen; otherwise
     count it loaded only.
   - Log one line per window: bounds, pages, events, frozen or not.
   - After every window, update the run's `detail` with `{ ...opts, windowsDone, lastWindow }`
     so an operator watching `GET /api/runs` sees progress and a failed run says where it
     stopped (`updateRunDetail(db, id, detail)` in `repositories/ingest-runs.ts`).
3. Unless `skipDetails`, drain `syncDetails(ctx, { limit: 200, order: "mag" })` until a pass
   fetches nothing, exactly as today.
4. `finishRun` with the totals; on any error, `finishRun({ ok: false, error })` and rethrow.
   The ledger keeps every window completed before the failure, so the next run resumes there.

`--days N` keeps working as `from = now - N days, to = now`.

## 6. Retry helper (`ingest/retry.ts`)

```ts
export interface RetryOptions { attempts?: number; baseMs?: number; sleep: (ms: number) => Promise<void>; log: IngestLogger }
export function retryable(err: unknown): boolean   // UsgsHttpError with status 429 or >= 500, or any non-UsgsHttpError (timeout, network)
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T>
```

Defaults: 5 attempts, delays `baseMs * 2^(attempt-1)` with `baseMs = 5_000` (5, 10, 20, 40 s
between the five attempts), each retry logged at warn with the attempt number and the error.
A 400 (for instance `limit` above the cap) is not retried.

## 7. CLI (`ingest-cli.ts`, parsing in `ingest/cli-args.ts`)

```
ingest backfill (--days N | --from DATE [--to DATE])
                [--min-magnitude M | --all-magnitudes]
                [--bbox minLon,minLat,maxLon,maxLat]
                [--force] [--skip-details] [--pause-ms N]
```

`parseBackfillArgs(values, now): BackfillOptions` is pure and tested: dates accept
`YYYY-MM-DD` or a full ISO stamp; `--to` defaults to `now`; `--min-magnitude` defaults to
2.5; `--all-magnitudes` sets null; `--bbox` is validated as the API validates it and rejected
when it crosses the antimeridian; `--days` and `--from` together is an error. The usage string
lists the new form. `ingest details` gains `--by-magnitude` to pass `order: "mag"`.

The recommended production run, documented in the README deploy section:

```
docker compose -f docker-compose.prod.yml run --rm -d server \
  node dist/ingest-cli.js backfill --from 1900-01-01 --skip-details
docker compose -f docker-compose.prod.yml run --rm -d server \
  node dist/ingest-cli.js backfill --from 1500-01-01 --to 1900-01-01 --all-magnitudes
```

followed by `ingest details --by-magnitude --limit 5000` passes (or simply the feeds), then
`VACUUM (ANALYZE) events;`. The page phase for scope D is a few hours; detail fetches take a
day or more at the polite rate.

## 8. API

All four new routes take the filter part of the list query (`since`, `until`, `minMag`,
`bbox`, with the same defaults and validation; no `limit`). `api/schemas.ts` splits
`eventsQuerySchema` into a filter schema and the list schema that extends it;
`parseEventsFilter(input, now): EventsFilter` and `toListFilter` take the filter type.

| Route | Response | Cache |
| --- | --- | --- |
| `GET /api/events/count` | `ApiEventCount { count: number; query: ApiEventFilter }` | 60 s |
| `GET /api/events/summary?by=day\|month\|year` | `ApiEventSummary { by; bins: ApiSummaryBin[]; query }` with `ApiSummaryBin { start: string; count: number; maxMag: number \| null; mags: { lt4; m4; m5; m6; m7 } }` (counts of M<4, 4-4.9, 5-5.9, 6-6.9, 7+; events with null magnitude count in `count` only). `by` defaults by span: day up to 120 days, month up to 15 years, year beyond. Empty bins are omitted; the client fills them. | 300 s |
| `GET /api/events/grid?cell=N` | `ApiEventGrid { cell: number; cells: ApiGridCell[]; query }`, `ApiGridCell { lat: number; lon: number; count: number; maxMag: number \| null }` with `lat`/`lon` the cell's south-west corner; `cell` in degrees, one of 0.25, 0.5, 1, 2, 5, default 1. | 300 s |
| `GET /api/catalog/coverage` | `ApiCoverage { spans: ApiCoverageSpan[] }`, `ApiCoverageSpan { from: string; to: string; minMag: number \| null; bbox: string \| null; events: number; windows: number }` | 300 s |

`ApiEventFilter` is `ApiEventQuery` without `limit`; `ApiEventQuery` extends it.
Repository functions `countEvents`, `summarizeEvents`, `gridEvents` live in
`repositories/events.ts` beside `listEvents` and share its condition builder. The summary
uses `date_trunc(by, time)`; the grid uses `floor(latitude / cell) * cell` and the same for
longitude. `ApiStatus` is unchanged; the coverage route is the catalogue's statement of record.

Routes register in `routes/events.ts` (count, summary, grid) and a new `routes/catalog.ts`
(coverage). Static paths are registered before `/api/events/:id` so Fastify does not treat
`count` as an id.

## 9. Error handling

- A page request that still fails after the retries, or a cursor that cannot advance, fails
  the run: `ingest_runs.ok = false`, `error` set, `detail.lastWindow` names the window.
  Ledger rows for the windows already completed stay.
- A failing detail fetch is logged and left for the next pass, as today.
- `--force` on a window already ledgered replaces the ledger row's counts and run id.
- Antimeridian bboxes and malformed dates are CLI errors before any request is made.

## 10. Testing

- Unit (`test/ingest/windows.test.ts`): the grid across the 1970 boundary (a request from
  1968-06-15 to 1971-02-10 yields 1971-02, 1971-01, the twelve months of 1970, then 1969 and
  1968), newest-first order, whole-window inclusion, `bboxKey`.
- Unit (`test/ingest/retry.test.ts`): retries 503 and a network error with the doubling
  delays through a fake `sleep`, gives up after five attempts, does not retry 400, returns the
  first success.
- Unit (`test/ingest/cli-args.test.ts`): every flag, defaults, each rejection.
- Integration (`test/repositories/catalog-windows.test.ts`): `windowCovered` across floor and
  bbox combinations, `recordWindow` upsert, `coverageSpans` merging and splitting.
- Integration (`test/repositories/events.test.ts`): `last_seen` not bumped within an hour and
  bumped after (set the stored value back with SQL); alias merge deletes the aliased row and
  its mechanisms and reports `merged`; `listDetailCandidates` magnitude order; `countEvents`,
  `summarizeEvents` (day, month, year, `mags`, null magnitude), `gridEvents` (cell corners,
  antimeridian box).
- Integration (`test/ingest/sync.test.ts`): the backfill walks newest first, skips a ledgered
  window, reloads it with `force`, freezes only windows older than the settle period, records
  progress in `detail`, pauses between pages through the injected `sleep`, retries a 503 from
  the stub, orders detail fetches by magnitude, honours `skipDetails`, and leaves the ledger
  intact when a later window fails.
- Routes (`test/routes/events.test.ts`, new `test/routes/catalog.test.ts`): the four routes,
  their defaults, validation of `by` and `cell`, cache headers, and that `/api/events/count`
  is not swallowed by `/api/events/:id`.
- Coverage stays at 100% on `apps/server/src`; `ingest-cli.ts` remains excluded.

## 11. Docs

README: the backfill command form, the production run recipe, the four endpoints in the API
table, a sentence on the ledger. CLAUDE.md Ingest section: the ledger, settle period, window
grid and the `last_seen` rule. `docs/research/earthquake-history.md` is unchanged.

## Out of scope

The UI (floor by span, overview mode, era marks, window-scoped status line), a materialised
summary table, loading GCMT or ISC directly, partitioning, and scope E (West Coast all
magnitudes), which this design supports through `--bbox` and `--all-magnitudes` but does not
run.
