# Earthquake history UI (phase 2) — design

**Date:** 2026-10-17
**Scope:** `apps/web` only, over the routes phase 1 added (`/api/events/summary`,
`/api/events/grid`). Follows `2026-10-17-earthquake-history-design.md`, whose "Out of scope"
section names this work.

## Goal

Let the Earthquakes page open any date window from 1900-01-01 to today without ever asking the
browser to draw more than it can hold, and show the whole window's seismicity honestly: individual
markers where the budget allows, server aggregates where it does not, and the detection-threshold
breaks in the record marked where they fall.

## Decisions

| Topic            | Decision                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date bounds      | The date inputs accept 1900-01-01 (`CATALOG_START`) to today. `RANGE_DAYS` (90) goes away.                                                                                                                  |
| Span presets     | A `Span…` select in the Refine bar sets the start date relative to the end: 30 days, 90 days, 1 year, 10 years, 50 years, since 1900. It is an action, not state: it snaps back to its placeholder.         |
| Budget           | `EVENT_LIMIT` stays 2,000 rows per list request.                                                                                                                                                            |
| Requested floor  | `max(region.minMag, filter.minMag)` is sent to the server for the window query. Today the filter minimum is applied only in the browser; sending it lets the floor do its work on long windows.             |
| Effective floor  | Chosen from the summary's magnitude bands: the requested floor if the window total fits the budget, else the lowest of M5, M6, M7 above the requested floor whose count fits; M7 if none does.              |
| Overview         | The window is "raised" when the effective floor is above the requested one. Then the map draws a density grid at the requested floor under the markers, and the time chart draws per-bin counts and maxima. |
| Grid cell        | 2° for the global view, 0.5° for the West Coast view (`gridCellFor(region)`). Both are among the server's `GRID_CELLS`.                                                                                     |
| Grid interaction | None. Cells have `pointer-events: none`; markers, plates and faults behave as before. The legend explains the shading.                                                                                      |
| Era marks        | Dashed verticals at 1964, 1973 and 1976 in the time chart whenever they fall inside the x-domain, in both chart modes, with labels and a caption explaining what changed in the record.                     |
| Magnitude input  | Shows the requested floor (what the reader controls). The effective floor appears in the Refine note and the map count line (what the page did).                                                            |
| Table            | Unchanged beyond its heading: "N of TOTAL events" where TOTAL is the window total at the requested floor.                                                                                                   |
| Status line      | Unchanged. It describes the catalogue (events since the oldest), not the window; window totals live next to the window controls.                                                                            |
| Animation        | Steps by day up to 120 days, by month (30 days) up to 15 years, by year (365 days) beyond. The speed input and step buttons name the unit.                                                                  |
| Coverage route   | Not used in this phase. The status line's "events since" already says how far back the catalogue reaches while the backfill runs.                                                                           |
| Count route      | Not used by the web; the summary's bin counts sum to the same total in one request.                                                                                                                         |

## 1. Filters and dates (`src/lib/filters.ts`, `FilterBar.vue`)

- `CATALOG_START = "1900-01-01"`. `dateBoundsFor(now, zone)` returns
  `{ min: CATALOG_START, max: today-in-zone }`. `RANGE_DAYS` is removed; `parseFilter` keeps
  clamping to the bounds, so an old `?since=` URL still works.
- `SPANS: readonly { label: string; days: number | null }[]` =
  30 days, 90 days, 1 year (365), 10 years (3652), 50 years (18262), since 1900 (`null`).
- `spanStart(until: string, days: number | null): string` returns the calendar day `days`
  before `until` (`CATALOG_START` when `days` is null), never earlier than `CATALOG_START`.
  Day arithmetic is done on the YYYY-MM-DD string through `Date.UTC`, so it is zone-free.
- FilterBar adds the select after the date inputs:
  `<select aria-label="Set the window span" @change="pickSpan">` with a disabled placeholder
  option `Span…` selected, then one option per `SPANS` entry. `pickSpan` calls
  `setFilter({ ...filter, since: spanStart(span.until, days) })`, keeping `until`, then resets
  the select's value to the placeholder.
- FilterBar adds a note line (`<p class="fnote">`) rendered only when the catalog reports a
  raised floor:
  `This window holds 61,204 events at M4.5+. Markers, table and the magnitude charts show the
1,842 at M6+ so the page stays responsive; the density shading and the time chart cover all of
them.` Numbers through `fmtInt`, magnitudes through `fmtMag` without trailing zeros for whole
  numbers (`M6+`, `M4.5+`): a small `fmtFloor(m)` helper in `format.ts` returns `M${m}+` using
  `String(m)`.

## 2. API client (`src/lib/api.ts`)

```ts
export interface EventsFilterQuery {
  since: string;
  until?: string;
  minMag?: number;
  bbox?: string;
}
export interface EventsQuery extends EventsFilterQuery {
  limit?: number;
}
export interface GridQuery extends EventsFilterQuery {
  cell: number;
}
// ApiClient gains:
summary: (query: EventsFilterQuery) => Promise<ApiEventSummary>;
grid: (query: GridQuery) => Promise<ApiEventGrid>;
```

`toParams` takes `EventsFilterQuery & { limit?: number; cell?: number }` and sets `limit` and
`cell` when present. `summary` never sends `by`; the server picks the bin size and reports it.
`test/support/api.ts` gets `summary` and `grid` mocks returning one bin / one cell by default.

## 3. Catalog (`src/lib/catalog.ts`)

New exports:

```ts
export interface WindowStats {
  /** Floor of the loaded list: the requested floor, or the band it was raised to. */
  floor: number;
  /** Events in the window at the requested floor. */
  total: number;
  by: SummaryBy;
  bins: ApiSummaryBin[];
  /** Density at the requested floor; null unless the floor was raised. */
  grid: ApiEventGrid | null;
}

/** The lowest floor whose count fits the budget: the requested one, else M5, M6, M7. */
export function chooseFloor(requested: number, bins: ApiSummaryBin[], budget: number): number;
export function gridCellFor(region: ApiRegion): number; // 2 global, 0.5 bbox
export function filterQueryFor(region: ApiRegion, range: Range, minMag: number): EventsFilterQuery;
```

`chooseFloor` sums the bands over all bins: total = Σ count, at5 = Σ (m5 + m6 + m7),
at6 = Σ (m6 + m7), at7 = Σ m7. Candidates are `[requested, 5, 6, 7]` filtered to those at or
above `requested` and strictly ascending (so a requested 5 is tried once, a requested 5.5 tries 5.5,
6, 7); the first whose count ≤ `budget` wins; `7` if none does.

`Catalog` gains:

- `requested: ComputedRef<number>` = `max(region.minMag, filter.minMag ?? -∞)`.
- `stats: ShallowRef<WindowStats | null>`, null until a window has loaded or after a failure that
  left no window.
- `raised: ComputedRef<boolean>` = `stats.floor > requested`.
- `floor` now returns `stats.value?.floor ?? requested.value` (the effective floor), so the charts
  and legend pick it up unchanged.
- `windowTotal: ComputedRef<number>` = `stats.value?.total ?? windowEvents.value.length`.

`loadRange(region, range)` becomes:

1. `const base = filterQueryFor(region, range, requested.value)`.
2. `const s = await api.summary(base)`; `const floor = chooseFloor(requested, s.bins, EVENT_LIMIT)`.
3. In parallel: `api.events({ ...base, minMag: floor, limit: EVENT_LIMIT })` and, when
   `floor > requested`, `api.grid({ ...base, cell: gridCellFor(region) })`, else `null`.
4. On success set `rangeEvents`, `truncated`, and
   `stats = { floor, total: Σ bins.count, by: s.by, bins: s.bins, grid }`.

The sequence token guards every await as today; a stale answer is dropped at each step. Any
rejection sets `error`, keeps the previous list and stats, and clears `loading`. `setRange` and
`setRegion` clear `stats` with `rangeEvents`. `eventsQueryFor` becomes
`filterQueryFor(region, now, range, minMag)`; the preset load passes `null` and `region.minMag`.

Changing `filter.minMag` now triggers a window reload, because the requested floor is part of the
query: `setFilter` compares the requested floor before and after the change and, when it differs and
a range is set, calls `loadRange` again. `maxMag` and the depth bounds stay browser-side through
`applyFilter`.

## 4. Density layer (`src/lib/density.ts`, `MapDensity.vue`, `QuakeMap.vue`, `MapLegend.vue`)

`MapDensity.vue` props: `path: GeoPath`, `grid: ApiEventGrid`. It computes, once per grid or path
change, one `{ d, opacity }` per cell: `d = path(polygon)` for the cell's four corners (closed ring,
clockwise, as d3-geo requires for a ring smaller than a hemisphere), skipping cells whose path is
null; `opacity = scaleLog().domain([1, max]).range([0.08, 0.75]).clamp(true)(count)`
where `max` is the largest count in the grid. The template is
`<g class="density" style="pointer-events: none"><path v-for … :d :fill-opacity style="fill: var(--accent)" /></g>`.

QuakeMap adds a `showDensity` ref (true) and, in `tools`, a `Density` checkbox rendered only when
`catalog.raised` is true. In `layers`, `<MapDensity v-if="catalog.raised.value && showDensity && stats.grid !== null" :path="mv.view.value.path" :grid="stats.grid" />`
goes before `MapEvents` so markers stay on top.

The count line becomes `Showing ${filtered} of ${fmtInt(windowTotal)} events`, with
` · markers at ${fmtFloor(floor)}` appended when raised.

MapLegend gets a `density?: { cell: number; floor: number; max: number } | null` prop (default
null). When set, it renders a row with a five-step opacity ramp of `var(--accent)` and the text
`events per ${cell}° cell at ${fmtFloor(floor)}: 1 → ${fmtInt(max)} (log scale)`. MapShell passes
the prop through from a new optional `density` prop so VolcanoMap is untouched.

## 5. Time chart (`MagnitudeTimeChart.vue`, `ChartAxes.vue`, `src/lib/eras.ts`)

`eras.ts`:

```ts
export interface Era {
  year: number;
  label: string;
  note: string;
}
export const ERAS: readonly Era[] = [
  {
    year: 1964,
    label: "WWSSN",
    note: "WWSSN network and ISC founded; global record complete to about M5.5–6",
  },
  { year: 1973, label: "PDE", note: "NEIC PDE enters ComCat; complete to about M4.5" },
  {
    year: 1976,
    label: "GCMT",
    note: "Global CMT begins; Mw measured rather than proxied above about M5",
  },
];
export function erasWithin(from: Date, to: Date): Era[]; // those with Date.UTC(year,0,1) in [from, to]
```

`ChartAxes` gains an optional `yRightTicks?: Tick[]` prop drawn along `width - margin.r` with
labels anchored start, 4 px to the right. No other change.

MagnitudeTimeChart keeps its per-event mode and adds an overview mode selected by
`catalog.raised`:

- x: the window `[since, min(until, now)]` in both modes (the per-event mode used to start at the
  first event).
- Per-bin bars: left-axis count, linear, `[0, max count]` niced, drawn as `rect`s one bin wide
  (`binEnd(start, by)` minus one pixel) in `var(--border)` at 0.7 opacity.
- Per-bin maxima: right-axis magnitude `[floor, ceil(max maxMag)]`, drawn as accent circles
  (r 3) at the bin's midpoint; bins with `maxMag === null` draw no circle. A `<title>` carries
  `${label}: ${fmtInt(count)} events, largest M${fmtMag(maxMag)}` where label is the bin start
  formatted by `by` (YYYY, YYYY-MM or YYYY-MM-DD, UTC).
- Era marks in both modes: `erasWithin(domain)` → dashed `var(--muted)` lines from top to the
  x-axis with the label text at the top, anchored start, 3 px right of the line.
- Caption in overview mode:
  `Bars count events per ${by} at ${fmtFloor(requested)}; dots are the largest in each. ${erasSentence}`
  where `erasSentence` is empty when no era falls in the window, else
  `Dashed lines mark changes in the record, not in the Earth: ` followed by
  `${year} (${note})` joined by `; ` and a full stop. In per-event mode the existing caption gains the
  same sentence when an era falls in the window.
- When the zone is local, the overview caption ends with ` Bins are UTC.`

## 6. Other components

- `FrequencyMagnitudeChart`: the Mc phrase becomes `window floor` when `catalog.raised` is true
  (today it says `filter minimum` or `catalog floor`).
- `CatalogTable` heading: `${filtered.length} of ${fmtInt(windowTotal)} events · tap a row for detail`
  when they differ, else as today. (It compared against the preset list before, which was wrong
  whenever a date range was set.)
- `StatsStrip`, `MajorEvents`, `DepthChart`, `DetailPanel`: unchanged.

## 7. Animation (`src/lib/animation.ts`, `QuakeMap.vue`)

- `type StepUnit = "day" | "month" | "year"`, `UNIT_MS = { day: 864e5, month: 30 * 864e5, year: 365 * 864e5 }`,
  `unitFor(start: Date, end: Date): StepUnit` (≤ 120 days → day, ≤ 15 years → month, else year).
- `Animation` renames `secondsPerDay` to `secondsPerUnit` and `stepDay` to `step`, and gains
  `unit: Ref<StepUnit>` set in `open` from `unitFor`. `advance` and `step` use `UNIT_MS[unit]`.
- QuakeMap's bar labels read `Seconds per ${unit}` and the step buttons' aria-labels
  `Back one ${unit}` / `Forward one ${unit}`.

## 8. Error handling

- A failed summary, list or grid request sets `catalog.error` (the existing banner with Retry) and
  keeps the previous list and stats. Retry reruns `loadAll`.
- A summary with no bins yields `total 0`, `floor = requested`, an empty list request (cheap) and
  no grid.
- `maxMag: null` bins and cells are drawn without a magnitude; counts still show.
- A cell whose polygon does not project (returns null) is skipped.

## 9. Testing

Vitest, 100% coverage on `apps/web/src` as before.

- `filters.test.ts`: `dateBoundsFor` min is 1900-01-01; `spanStart` for each preset including the
  1900 clamp; `parseFilter` still clamps to the bounds.
- `catalog.test.ts`: `chooseFloor` (fits at requested; raised to 5, 6, 7; none fits → 7; requested
  5.5 skips 5); `gridCellFor`; `filterQueryFor`; `loadRange` calls summary then list and grid with
  the expected floors, exposes `stats`, `raised`, `floor`, `windowTotal`; a requested-floor change
  reloads; a stale summary is dropped; a grid failure sets the error and keeps the old list.
- `eras.test.ts`: `erasWithin` boundaries.
- `animation.test.ts`: `unitFor` thresholds; `step` and `advance` move by the unit; rename
  fallout.
- Components: `FilterBar` (span select writes `since`, snaps back; note shown only when raised),
  `MapDensity` (paths and opacities, null projection skipped), `QuakeMap` (density toggle only
  when raised, count line suffix), `MapLegend` (density row), `MagnitudeTimeChart` (overview bars
  and dots, null maxMag, era lines in both modes, UTC note in local zone), `ChartAxes` (right
  ticks), `CatalogTable` heading, `FrequencyMagnitudeChart` caption.
- `test/support/api.ts`: `summary` and `grid` mocks; a `raisedApi()` helper whose summary bands
  exceed the budget so component tests can exercise overview mode.

## 10. Docs

- README: the Front end section notes the century window, the floor rule, overview mode and the
  era marks; the footer "Data" paragraph in `App.vue` gains one sentence on the historical record
  (ComCat back to 1900 through ISC-GEM and the Centennial catalogue; completeness varies by era,
  marked on the time chart).
- CLAUDE.md Front end bullet: window loading order (summary → list + grid), `chooseFloor`,
  `MapDensity`, `eras.ts`, animation units.
- Memory roadmap entry.

## Out of scope

Grid tooltips and click-to-zoom on cells, a materialised summary table on the server, a coverage
display from `/api/catalog/coverage`, finer magnitude bands than whole numbers, paging the table
past the budget, and per-event depth in overview bins.
