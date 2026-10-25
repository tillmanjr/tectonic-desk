# Space weather: the Space page

Date: 2026-10-25. Sub-project: Server and front end. Status: approved. Research:
`docs/research/2026-10-17-space-weather.md` (on the `research/data-sources` branch).

## Why

The desk reads the solid Earth; the Sun drives the other half of the geophysical record a
geologist with a magnetometer cares about. NOAA's Space Weather Prediction Center publishes
everything needed as public-domain JSON, but keeps only six hours to seven days of it. Storing
our own copy from day one is what makes a storm revisitable later.

## Scope

This is the first of four sub-projects; the others are backlog:

1. **The Space page** (this spec): server polls SWPC into Postgres, two API reads, a `/space`
   page with summary tiles, a shared-axis stack of time series, the three-day forecast, flares
   and alerts, a window select and a date range.
2. Aurora overlay (OVATION grid) on the maps.
3. Long history: GFZ definitive Kp, Dst, F10.7 and sunspot number back decades, the Kp estimate
   against the definitive value.
4. Imagery: SDO and SUVI latest frames proxied through the server.

Also backlog: F10.7, sunspot number and the 27-day outlook on the page; DONKI CME enrichment.

## Decisions

| Topic       | Decision                                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content     | Core plus second ring: Kp (1-minute estimate and 3-hour), NOAA scales R/S/G now and D+1..D+3, solar wind Bz and Bt, speed and density, GOES X-ray long and short channels, protons ≥10 and ≥100 MeV, flares, alerts, Kyoto Dst.     |
| Time        | Window select 6 h, 24 h, 3 d, 7 d, 30 d plus a from/to range; all charts share the window. One-minute rows kept 30 days, then a 5-minute mean indefinitely; 3-hour Kp, Dst, flares, alerts and scales kept forever.                 |
| Shell       | A fourth page pill, Space, at `/space`. No region: the region tabs hide, the refine bar carries the window and range, the status line shows SWPC freshness and sources. Active Earth is unchanged.                                  |
| Layout      | Six tiles across the top; one tall stack of every series on one time axis; forecast, flares and alerts in a right-hand rail that drops under the stack below 900 px (mockup A).                                                     |
| Storage     | One tall `space_samples` table keyed `(series, time, source)` plus record tables `space_flares`, `space_alerts`, `space_scales`. Adding a series is a new id, not a migration.                                                      |
| Polling     | Five-minute jobs for the fast series and the event files, hourly for the slow ones, six-hourly prune. SWPC gzips on the wire (the 1.4 MB mag file is 136 KB) and Node's fetch asks for gzip, so the solar wind costs ~100 MB a day. |
| Ingest runs | The space jobs do not write `ingest_runs` (288 rows a day per job would drown the status page); the `now` read reports each series' latest sample time, which is the health signal that matters.                                    |
| Credits     | A "Space weather" footer paragraph (NOAA SWPC, public domain; Kyoto WDC for Geomagnetism for Dst; NOAA GOES) and matching rows in the README table.                                                                                 |

## 1. Shared (`packages/shared/src/space.ts`, `api.ts`)

```ts
export const SPACE_SERIES = [
  "kp_1m",
  "kp_3h",
  "dst",
  "bz_gsm",
  "bt",
  "speed",
  "density",
  "xray_long",
  "xray_short",
  "p10",
  "p100",
] as const;
export type SpaceSeries = (typeof SPACE_SERIES)[number];

/** One measurement of one series from one instrument or agency. */
export interface SpaceSample {
  series: SpaceSeries;
  time: Date;
  source: string;
  value: number;
}

/** A GOES X-ray flare as SWPC lists it; end fields arrive after the begin. */
export interface SpaceFlare {
  beginTime: Date;
  maxTime: Date | null;
  endTime: Date | null;
  beginClass: string | null;
  maxClass: string | null;
  endClass: string | null;
  /** Peak 0.1–0.8 nm flux, W/m². */
  maxXrlong: number | null;
  satellite: number | null;
}

export interface SpaceAlert {
  productId: string;
  issueTime: Date;
  message: string;
}

export type ScalesKind = "observed" | "predicted";
/** NOAA scales for one UTC day: observed levels, or predicted G level with R and S probabilities. */
export interface SpaceScales {
  day: Date;
  kind: ScalesKind;
  issued: Date;
  r: number | null;
  s: number | null;
  g: number | null;
  rMinorProb: number | null;
  rMajorProb: number | null;
  sProb: number | null;
  /** The day's largest 3-hour Kp (observed or predicted). */
  kpMax: number | null;
}
```

```ts
export interface ApiSpaceReading {
  time: string;
  value: number;
  source: string;
}
export type ApiSpaceFlare = Json<SpaceFlare>;
export type ApiSpaceAlert = Json<SpaceAlert>;
export type ApiSpaceScales = Json<SpaceScales>;

/** `GET /api/space/now`: the latest reading per series, the scales rows and the newest events. */
export interface ApiSpaceNow {
  generatedAt: string;
  latest: Record<SpaceSeries, ApiSpaceReading | null>;
  /** Yesterday and today observed, then the three predicted days, by day. */
  scales: ApiSpaceScales[];
  latestFlare: ApiSpaceFlare | null;
  latestAlert: ApiSpaceAlert | null;
}

/** `GET /api/space/window?from=&to=`: samples thinned to one shared bucket, with the events inside. */
export interface ApiSpaceWindow {
  from: string;
  to: string;
  /** Seconds per bucket when thinned; null when the rows came back raw. */
  bucketSeconds: number | null;
  /** Per series, `[epoch ms, value]` ascending. */
  samples: Record<SpaceSeries, [number, number][]>;
  flares: ApiSpaceFlare[];
  alerts: ApiSpaceAlert[];
  scales: ApiSpaceScales[];
}
```

## 2. Server

### Schema (`src/db/schema.ts`, one generated migration)

- `space_samples(series text, time timestamptz, source text, value real)` primary key
  `(series, time, source)`, index `(series, time desc)`.
- `space_flares(begin_time timestamptz pk, max_time, end_time, begin_class text, max_class text,
end_class text, max_xrlong double precision, satellite integer)`.
- `space_alerts(product_id text, issue_time timestamptz, message text)` primary key
  `(product_id, issue_time)`, index `(issue_time desc)`.
- `space_scales(day date, kind text, issued timestamptz, r, s, g, r_minor_prob, r_major_prob,
s_prob integer, kp_max real)` primary key `(day, kind)`, check `kind in ('observed','predicted')`.

### Client and parsers (`src/space/{schema,client,parse}.ts`)

`createSpaceClient({ fetch?, userAgent, timeoutMs?, base? })` with one `getJson(path, schema)`;
`SpaceHttpError(status, url)` like the volcano client. Files and schemas (loose objects, read
fields checked, the others pass through):

| Method            | File                                             | Parsed to                                                                                |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `fetchKp1m`       | `json/planetary_k_index_1m.json`                 | `kp_1m` from `estimated_kp`, source `swpc`                                               |
| `fetchKp3h`       | `products/noaa-planetary-k-index.json`           | `kp_3h` from `Kp`, source `swpc`                                                         |
| `fetchKpForecast` | `products/noaa-planetary-k-index-forecast.json`  | per-day `kpMax` for the scales rows                                                      |
| `fetchDst`        | `products/kyoto-dst.json`                        | `dst`, source `kyoto`                                                                    |
| `fetchMag`        | `json/rtsw/rtsw_mag_1m.json`                     | `bz_gsm`, `bt` from rows with `active: true`, source = spacecraft                        |
| `fetchWind`       | `json/rtsw/rtsw_wind_1m.json`                    | `speed` (`proton_speed`), `density` (`proton_density`), active rows only                 |
| `fetchXrays`      | `json/goes/primary/xrays-6-hour.json`            | `xray_long` (`0.1-0.8nm`), `xray_short` (`0.05-0.4nm`) from `flux`, source `GOES-<n>`    |
| `fetchProtons`    | `json/goes/primary/integral-protons-6-hour.json` | `p10` (`>=10 MeV`), `p100` (`>=100 MeV`), source `GOES-<n>`                              |
| `fetchFlares`     | `json/goes/primary/xray-flares-7-day.json`       | `SpaceFlare[]`                                                                           |
| `fetchAlerts`     | `products/alerts.json`                           | `SpaceAlert[]`; `issue_datetime` `2026-10-24 09:04:23.307` read as UTC                   |
| `fetchScales`     | `products/noaa-scales.json`                      | `SpaceScales[]`: keys `-1`,`0` observed, `1`..`3` predicted; `issued` is key `0`'s stamp |

`parseTime(s)` accepts `2026-10-25T03:13:00`, `…03:13:02`, `…Z` and the alerts form, always as
UTC. Rows with a null value are skipped. `kpMaxByDay(forecastRows)` gives `Map<day, max kp>`
across observed, estimated and predicted rows; `withKpMax(scales, map)` fills the rows.

### Repository (`src/repositories/space.ts`)

Plain functions on `Db`: `upsertSamples(db, samples)` (on conflict update `value`, chunks of
1,000 rows), `upsertFlares`, `insertAlerts` (on conflict do nothing), `upsertScales` (latest
`issued` wins), `latestReadings(db)` (distinct on series, newest), `samplesBetween(db, series,
from, to, bucketSeconds | null)` (raw rows, or `date_bin` means grouped by ordinal),
`flaresBetween`, `alertsBetween`, `scalesBetween(db, fromDay, toDay)`, `scalesAround(db, today)`
(yesterday to D+3), `downsampleBefore(db, cutoff)` (insert 5-minute means of the fine series
older than the cutoff on conflict update, then delete rows older than the cutoff whose epoch is
not a multiple of 300; returns the deleted count).

### Jobs (`src/ingest/space.ts`)

`SpaceContext { db, space: SpaceClient, log, now }`. Each job fetches its files with
`Promise.allSettled`, parses and writes each result that arrived, logs each failure with the
file name, and throws only when every file failed (so the scheduler logs a run failure).

| Job            | Files                                | Every (config, default)               |
| -------------- | ------------------------------------ | ------------------------------------- |
| `space_fast`   | Kp 1-min, mag, wind, X-rays, protons | `SPACE_FAST_INTERVAL_MS`, 300 000     |
| `space_events` | flares, alerts, scales + Kp forecast | `SPACE_EVENTS_INTERVAL_MS`, 300 000   |
| `space_slow`   | Kp 3-hour, Dst                       | `SPACE_SLOW_INTERVAL_MS`, 3 600 000   |
| `space_prune`  | `downsampleBefore(now − 30 d)`       | `SPACE_PRUNE_INTERVAL_MS`, 21 600 000 |

`SPACE_ENABLED` (default true) lets a deployment leave the jobs out. `index.ts` registers them
beside the volcano jobs.

### Routes (`src/routes/space.ts`)

- `GET /api/space/now`, `cacheFor(reply, 60)`: `latestReadings`, `scalesAround(today)`, newest
  flare and alert.
- `GET /api/space/window?from=&to=`, `cacheFor(reply, 60)`: strict object; `from` required ISO
  instant, `to` optional (default now); `to` before `from` or a span over 93 days is a 400.
  `bucketFor(from, to)`: null when the span is at most 25 hours, else the span divided by 1,500
  rounded up to a whole minute. Every series uses the same bucket so the crosshair lines up.
  Empty store: 200 with empty arrays, never 404.

## 3. Front end

### Router and shell

- `Page` gains `"space"`; route `/space` with `meta.page: "space"`; `pagePath("space", any)` is
  `/space`; `hasVolcanoes("space")` is false; `PageSwitch` lists Space last.
- `App.vue`: `createSpaceStore` provided under `SPACE`; `SET_SPACE_RANGE` writes the route.
  Route keys: `window` (`6h|24h|3d|7d|30d`, default `24h`) or `from` and `to` (ISO instants to
  the minute, UTC); `from`/`to` win when both parse. The region tabs render only when the page
  is not Space; `StatusLine` is replaced by `SpaceStatus` there; `SpacePage` renders outside the
  `region !== null` guard. `hereTarget` treats Space like a page without panels (switches to
  Active Earth).
- Marks: nothing to mark on this page; the pill and overlay keep working.

### State (`src/lib/space.ts`)

```ts
export const WINDOWS = [{ id: "6h", ms }, { id: "24h" }, { id: "3d" }, { id: "7d" }, { id: "30d" }];
export type WindowId = ...;
export type SpaceRange = { kind: "window"; id: WindowId } | { kind: "fixed"; from: Date; to: Date };
export function parseSpaceRange(query): SpaceRange;        // default { kind: "window", id: "24h" }
export function spaceRangeQuery(r): { window?, from?, to? };
export function rangeBounds(r, now): { from: Date; to: Date };
export function createSpaceStore(api, now, opts?: { intervalMs?, doc? }): SpaceStore;
```

`SpaceStore { now: Ref<ApiSpaceNow|null>; window: Ref<ApiSpaceWindow|null>; range: Ref<SpaceRange>;
error: Ref<string|null>; loading: Ref<boolean>; setRange(r); load(); start(); stop() }`. `load`
fetches both reads; `start` polls every 60 s while the range is a window, never for a fixed
range, and pauses while the document is hidden (the `DocLike` pattern from `status.ts`).

Pure helpers in `src/lib/space-format.ts`: `xrayClass(flux)` → `"M1.3"`, `gLevel(kp)` (0..5),
`scaleColour(level)`, `alertTitle(message)` (the first line after the header block, e.g.
`WARNING: Geomagnetic K-index of 5 expected`), `fmtKp(v)` (`4-`, `4`, `4+` from thirds),
`toInputValue(date, zone)` / `fromInputValue(text, zone)` for `datetime-local`.

Chart maths in `src/lib/space-chart.ts`: `ROWS: RowSpec[]` (id, label, unit, series, `scale:
"linear" | "log"`, fixed or data-driven domain, reference values, colours), `rowDomain(spec,
values)`, `linePath(points, x, y, gapMs)` (breaks the line across gaps longer than `gapMs`),
`nearestSample(series, ms)` (binary search), `flareBands(flares, x)`.

### Components

- `SpacePage.vue`: tiles, then a two-column grid (`.spacegrid`): `SpaceStack` left, the rail
  (`SpaceForecast`, `SpaceFlares`, `SpaceAlerts`) right; error banner with Retry.
- `SpaceRefine.vue`: `RefineBar`-styled bar (`.filters.refine.space`) with the Window select and
  From/To `datetime-local` inputs in the active zone; a fixed range shows "Custom" in the select.
- `SpaceStatus.vue`: `Live · NOAA SWPC · newest sample <stamp> · <ago> · mag SOLAR1 · plasma
SOLAR1 · GOES-18`; `warn` class when the newest sample is older than 15 minutes, `bad` when
  the store has an error.
- `SpaceTiles.vue`: six `.stat` tiles in `.stats.space` with a `.spark` sparkline from the window
  series: Kp (1-min, `3-h 4-` sub), Scales (G R S chips, D+1 line), Bz·Bt, Speed·density, X-ray
  (class), Protons ≥10 (with ≥100 sub).
- `SpaceStack.vue`: one `scaleUtc`/`scaleTime` x axis across the window, six `SpaceRow`s each 72
  px tall sharing a 900 px viewBox, alert ticks along the top, a crosshair on pointer move with
  each row's value at that instant, flare bands highlighted when `highlight` matches.
- `SpaceRow.vue`: axes via `ChartAxes` with `grid: false` (own y ticks, log ticks for the X-ray
  and proton rows with class or S letters), reference lines (zero for Bz and Dst, G1 at Kp 5,
  M1 and X1 flux, S1 at 10 pfu), Kp 3-hour bars coloured by G level, lines per series.
- `SpaceForecast.vue`, `SpaceFlares.vue` (hover → `highlight`, click → `setRange` fixed from
  begin − 1 h to end + 2 h), `SpaceAlerts.vue` (title from `alertTitle`, click expands `message`
  in a `<pre>`).

### Empty and error states

Before data: tiles show `—`, the stack prints "No samples yet". A failed read: the page banner
with Retry, previous data kept. The status line turns amber at 15 minutes stale.

## 4. Testing

Server: fixtures under `test/fixtures/swpc/` trimmed from the live files of 2026-10-25; a stub
client in `test/support/space-stub.ts`; parser tests (timestamp forms, null rows, inactive
spacecraft rows, scale strings, Kp max by day); repository and job tests on the testcontainers
Postgres (upsert revising a Kp estimate, flare end arriving later, alert dedupe, the downsample
leaving 5-minute means and deleting the fine rows, a failing file leaving the others written, all
failing throwing); route tests (bucketing, cap, bad instants, empty store); schema test for the
new keys. Web: `fakeApi` gains `spaceNow` and `spaceWindow` over `test/support/space.ts`
fixtures; tests for the store, helpers, chart maths, each component, the router and the shell.
Coverage stays at 100%. Chrome check on the dev stack with live polling; the 30-day view and the
downsample verified against a seeded dev database.
