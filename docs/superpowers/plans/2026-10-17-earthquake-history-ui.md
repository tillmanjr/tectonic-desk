# Earthquake History UI (phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the Earthquakes page to any window from 1900 to today, keep the browser under a 2,000-event budget by raising the marker floor from the summary's magnitude bands, and show the rest of the window as a density grid and per-bin counts with the catalogue's era breaks marked.

**Architecture:** `createCatalog` loads a window in two steps: `GET /api/events/summary` at the requested floor (its bands give the window total and the floor the list can afford), then the list at that floor plus `GET /api/events/grid` at the requested floor when the floor was raised. The result is one `WindowStats` object the map, charts, Refine bar and table read through the injected catalog; no component calls the aggregate routes itself. The animation steps by day, month or year from the window length.

**Tech Stack:** Vue 3 SFCs, d3-scale (`scaleLog`, `scaleUtc`), d3-geo paths through the existing `MapView`, Vitest + @vue/test-utils, shared DTOs from `@tectonic/shared`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-17-earthquake-history-ui-design.md`.
- `apps/web/src` coverage stays 100% on all four metrics; add tests, never lower thresholds.
- TypeScript strict with `noUncheckedIndexedAccess`; no `as` casts to silence nullability, no `!`.
- Local imports end in `.js`. Components call injected functions (`SELECT`, `SET_FILTER`), never the router.
- `EVENT_LIMIT` stays 2000. `CATALOG_START` is `"1900-01-01"`. Grid cells: 2 (global), 0.5 (bbox).
- Floors the list can be raised to are whole numbers 5, 6, 7 (the summary's bands).
- Copy is for a geologist: name the catalogues (WWSSN, PDE, GCMT), never "data got better".
- Run from the repo root: `pnpm --filter @tectonic/web test`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`.
- One commit per task, on branch `earthquake-history-ui`, with the Co-Authored-By trailer.

---

### Task 1: Dates back to 1900 and span presets

**Files:**

- Modify: `apps/web/src/lib/filters.ts`
- Modify: `apps/web/src/components/FilterBar.vue`
- Modify: `apps/web/src/styles.css` (one rule)
- Test: `apps/web/test/lib/filters.test.ts`, `apps/web/test/components/FilterBar.test.ts`

**Interfaces:**

- Produces: `CATALOG_START: "1900-01-01"`, `SPANS: readonly Span[]` (`{ label: string; days: number | null }`), `spanStart(until: string, days: number | null): string`. `dateBoundsFor(now, zone)` keeps its signature; `RANGE_DAYS` is removed.

- [ ] **Step 1: Update the filters tests**

In `apps/web/test/lib/filters.test.ts`, import `spanStart` and `CATALOG_START`, change `bounds` and the clamped-dates expectation, and replace the 90-day test:

```ts
import {
  applyFilter,
  CATALOG_START,
  dateBoundsFor,
  dayEnd,
  dayStart,
  EMPTY_FILTER,
  filterQuery,
  hasRange,
  isActive,
  parseBound,
  parseDate,
  parseFilter,
  rangeInstants,
  resolveDates,
  spanStart,
} from "../../src/lib/filters.js";
// ...
const bounds = { min: CATALOG_START, max: "2026-10-13" };
const now = new Date("2026-10-13T12:00:00Z");
```

In `parseFilter` › "keeps dates inside the bounds and ordered", the first expectation becomes:

```ts
expect(parseFilter({ since: "1899-12-31", until: "2027-01-01" }, 4.5, bounds)).toMatchObject({
  since: "1900-01-01",
  until: "2026-10-13",
});
```

Replace the "bounds the selectable dates to the last 90 days" test with:

```ts
it("bounds the selectable dates to the catalogue start and today", () => {
  expect(dateBoundsFor(now, "utc")).toEqual(bounds);
});
it("finds a span's start day, clamped to the catalogue start", () => {
  expect(spanStart("2026-10-13", 30)).toBe("2026-09-13");
  expect(spanStart("2026-10-13", 365)).toBe("2025-10-13");
  expect(spanStart("2026-03-01", 1)).toBe("2026-02-28");
  expect(spanStart("1900-02-01", 90)).toBe(CATALOG_START);
  expect(spanStart("2026-10-13", null)).toBe(CATALOG_START);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @tectonic/web test -- test/lib/filters.test.ts`
Expected: FAIL (`spanStart` and `CATALOG_START` are not exported; the bounds differ).

- [ ] **Step 3: Implement in `filters.ts`**

Replace the block from `/** How far back the date filter may reach. */` through `dateBoundsFor` with:

```ts
/** The earliest day the catalogue can be asked for. */
export const CATALOG_START = "1900-01-01";

/** The selectable date span: the catalogue start to today, as calendar days in the zone. */
export interface DateBounds {
  min: string;
  max: string;
}

/** The calendar day, in the zone, `n` days before `now`. */
function daysAgo(now: Date, n: number, zone: Zone): string {
  return dateIn(new Date(now.getTime() - n * 864e5).toISOString(), zone);
}

export function dateBoundsFor(now: Date, zone: Zone): DateBounds {
  return { min: CATALOG_START, max: daysAgo(now, 0, zone) };
}

/** A quick window length offered by the Refine bar; `days` null means since the catalogue start. */
export interface Span {
  label: string;
  days: number | null;
}

export const SPANS: readonly Span[] = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "10 years", days: 3652 },
  { label: "50 years", days: 18262 },
  { label: "Since 1900", days: null },
];

/** The calendar day `days` before `until` (the catalogue start when null), never earlier than that start. */
export function spanStart(until: string, days: number | null): string {
  if (days === null) return CATALOG_START;
  const [y, m, d] = ymd(until);
  const day = new Date(Date.UTC(y, m, d) - days * 864e5).toISOString().slice(0, 10);
  return day < CATALOG_START ? CATALOG_START : day;
}
```

`ymd` is declared further down the file as a `function` declaration, so hoisting makes it available.

- [ ] **Step 4: Add the span select to `FilterBar.vue`**

Imports gain `SPANS` and `spanStart`. Add after `changeDate`:

```ts
function pickSpan(ev: Event): void {
  const target = ev.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const pick = SPANS[Number(target.value)];
  target.value = "";
  if (pick === undefined) return;
  setFilter({ ...catalog.filter.value, since: spanStart(span.value.until, pick.days) });
}
```

In the template, after the "To date" input and before the Reset button:

```vue
<select class="fspan" value="" aria-label="Set the window span" @change="pickSpan">
      <option value="" disabled selected>Span…</option>
      <option v-for="(s, i) in SPANS" :key="s.label" :value="String(i)">{{ s.label }}</option>
    </select>
```

In `styles.css`, next to `.filters select` (around line 743), the existing rule already styles selects in the bar; add:

```css
.filters .fspan {
  width: auto;
}
```

- [ ] **Step 5: Update the FilterBar tests**

In "bounds the date inputs…" rename to "bounds the date inputs to the catalogue start and today, in the active zone" and change the `min` expectation to `"1900-01-01"`. Add a test:

```ts
it("sets the start from a span preset and snaps the select back", async () => {
  const ctx = await makeContext();
  const w = mountWith(FilterBar, ctx);
  const select = w.find<HTMLSelectElement>("select.fspan");
  expect(select.element.value).toBe("");
  await select.setValue("2");
  expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, since: "2025-10-13" });
  expect(select.element.value).toBe("");
  ctx.catalog.setFilter({ ...EMPTY_FILTER, until: "2026-09-01" });
  await nextTick();
  await select.setValue("5");
  expect(ctx.setFilter).toHaveBeenLastCalledWith({
    ...EMPTY_FILTER,
    until: "2026-09-01",
    since: "1900-01-01",
  });
  const stray = document.createElement("select");
  const opt = document.createElement("option");
  opt.value = "99";
  stray.append(opt);
  stray.value = "99";
  const ev = new Event("change");
  Object.defineProperty(ev, "target", { value: stray });
  select.element.dispatchEvent(ev);
  const div = new Event("change");
  Object.defineProperty(div, "target", { value: document.createElement("div") });
  select.element.dispatchEvent(div);
  expect(ctx.setFilter).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @tectonic/web test -- test/lib/filters.test.ts test/components/FilterBar.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/filters.ts apps/web/src/components/FilterBar.vue apps/web/src/styles.css apps/web/test/lib/filters.test.ts apps/web/test/components/FilterBar.test.ts
git commit -m "feat(web): dates back to 1900 and span presets in the Refine bar"
```

---

### Task 2: API client summary and grid

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/test/support/api.ts`
- Test: `apps/web/test/lib/api.test.ts`

**Interfaces:**

- Produces: `EventsFilterQuery { since; until?; minMag?; bbox? }`, `EventsQuery extends EventsFilterQuery { limit? }`, `GridQuery extends EventsFilterQuery { cell: number }`, `ApiClient.summary(q: EventsFilterQuery): Promise<ApiEventSummary>`, `ApiClient.grid(q: GridQuery): Promise<ApiEventGrid>`. Test support: `summaryOf(events)`, `gridOf(events)`, `listOf(events)`, `raisedApi(events?)`.

- [ ] **Step 1: Extend the api test**

In `apps/web/test/lib/api.test.ts` › "builds urls…", after the second `api.events(...)` call add:

```ts
await api.summary({ since: "2026-10-01", until: "2026-10-02", minMag: 4.5 });
await api.grid({ since: "2026-10-01", bbox: "-136,27,-104,53", cell: 0.5 });
```

and the two expected URLs after the second events URL:

```ts
      "/api/events/summary?since=2026-10-01&until=2026-10-02&minMag=4.5",
      "/api/events/grid?since=2026-10-01&bbox=-136%2C27%2C-104%2C53&cell=0.5",
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @tectonic/web test -- test/lib/api.test.ts`
Expected: FAIL (`api.summary is not a function`).

- [ ] **Step 3: Implement in `api.ts`**

```ts
import type {
  ApiError,
  ApiEventDetail,
  ApiEventGrid,
  ApiEventList,
  ApiEventSummary,
  ApiRegion,
  ApiStatus,
  ApiVolcanoChanges,
  ApiVolcanoDetail,
  ApiVolcanoReportList,
  ApiVolcanoStatusList,
} from "@tectonic/shared";

/** The window filters shared by the list and the aggregates. */
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
```

`ApiClient` gains, after `events`:

```ts
summary: (query: EventsFilterQuery) => Promise<ApiEventSummary>;
grid: (query: GridQuery) => Promise<ApiEventGrid>;
```

`toParams`:

```ts
function toParams(q: EventsFilterQuery & { limit?: number; cell?: number }): string {
  const p = new URLSearchParams();
  p.set("since", q.since);
  if (q.until !== undefined) p.set("until", q.until);
  if (q.minMag !== undefined) p.set("minMag", String(q.minMag));
  if (q.bbox !== undefined) p.set("bbox", q.bbox);
  if (q.limit !== undefined) p.set("limit", String(q.limit));
  if (q.cell !== undefined) p.set("cell", String(q.cell));
  return p.toString();
}
```

and in `createApiClient`'s returned object, after `events`:

```ts
    summary: (query) => get(`/events/summary?${toParams(query)}`),
    grid: (query) => get(`/events/grid?${toParams(query)}`),
```

- [ ] **Step 4: Extend the fake API**

Rewrite `apps/web/test/support/api.ts` so the default summary and grid are derived from whatever `events` returns, and add `raisedApi`:

```ts
import type {
  ApiEvent,
  ApiEventGrid,
  ApiEventList,
  ApiEventSummary,
  ApiStatus,
} from "@tectonic/shared";
import { vi } from "vitest";
import type { ApiClient, EventsQuery } from "../../src/lib/api.js";
import { event, GLOBAL, plateSegments, squareTopology, WC } from "./events.js";
import { faultsTopology } from "./faults.js";
import {
  changeList,
  eruptionFile,
  kilaueaDetail,
  reportList,
  statusList,
  volcanoFile,
} from "./volcanoes.js";

export function status(over: Partial<ApiStatus> = {}): ApiStatus {
  /* unchanged */
}

const QUERY = {
  since: "2026-10-06T12:00:00.000Z",
  until: null,
  minMag: 4.5,
  bbox: null,
};

export function listOf(events: ApiEvent[], truncated = false): ApiEventList {
  return { events, count: events.length, truncated, query: { ...QUERY, limit: 2000 } };
}

const band = (m: number | null): keyof ApiEventSummary["bins"][number]["mags"] =>
  m === null || m < 4 ? "lt4" : m < 5 ? "m4" : m < 6 ? "m5" : m < 7 ? "m6" : "m7";

/** One day bin holding every event, with bands counted from their magnitudes. */
export function summaryOf(events: ApiEvent[]): ApiEventSummary {
  const mags = { lt4: 0, m4: 0, m5: 0, m6: 0, m7: 0 };
  let maxMag: number | null = null;
  for (const e of events) {
    mags[band(e.mag)] += 1;
    if (e.mag !== null && (maxMag === null || e.mag > maxMag)) maxMag = e.mag;
  }
  const bins =
    events.length === 0
      ? []
      : [{ start: "2026-10-12T00:00:00.000Z", count: events.length, maxMag, mags }];
  return { by: "day", bins, query: QUERY };
}

/** One 2° cell per distinct event corner. */
export function gridOf(events: ApiEvent[]): ApiEventGrid {
  const cells = new Map<string, ApiEventGrid["cells"][number]>();
  for (const e of events) {
    const lat = Math.floor(e.latitude / 2) * 2;
    const lon = Math.floor(e.longitude / 2) * 2;
    const key = `${String(lat)},${String(lon)}`;
    const cell = cells.get(key) ?? { lat, lon, count: 0, maxMag: null };
    cell.count += 1;
    if (e.mag !== null && (cell.maxMag === null || e.mag > cell.maxMag)) cell.maxMag = e.mag;
    cells.set(key, cell);
  }
  return { cell: 2, cells: [...cells.values()], query: QUERY };
}

export function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  const events: ApiClient["events"] = over.events ?? vi.fn().mockResolvedValue(listOf([event()]));
  const derive = async (q: EventsQuery): Promise<ApiEvent[]> => (await events(q)).events;
  return {
    regions: vi.fn().mockResolvedValue([GLOBAL, WC]),
    events,
    summary: vi.fn().mockImplementation(async (q: EventsQuery) => summaryOf(await derive(q))),
    grid: vi.fn().mockImplementation(async (q: EventsQuery) => gridOf(await derive(q))),
    event: vi.fn().mockResolvedValue({
      ...event(),
      firstSeen: "2026-10-12T05:00:00.000Z",
      lastSeen: "2026-10-12T05:00:00.000Z",
      detailCheckedUpdated: null,
      usgs: { title: "M 5.5" },
    }),
    status: vi.fn().mockResolvedValue(status()),
    geo: vi.fn().mockImplementation(/* unchanged */),
    volcanoStatus: vi.fn().mockResolvedValue(statusList),
    volcanoChanges: vi.fn().mockResolvedValue(changeList),
    volcanoReports: vi.fn().mockResolvedValue(reportList),
    volcano: vi.fn().mockResolvedValue(kilaueaDetail),
    ...over,
  };
}

/** Two year bins whose bands overflow the budget at M4.5 and M5 but fit at M6 (total 7,312). */
export const RAISED_SUMMARY: ApiEventSummary = {
  by: "year",
  bins: [
    {
      start: "1964-01-01T00:00:00.000Z",
      count: 3910,
      maxMag: 8.4,
      mags: { lt4: 0, m4: 2400, m5: 1500, m6: 9, m7: 1 },
    },
    {
      start: "2026-01-01T00:00:00.000Z",
      count: 3402,
      maxMag: null,
      mags: { lt4: 0, m4: 2400, m5: 1000, m6: 2, m7: 0 },
    },
  ],
  query: QUERY,
};

export const RAISED_GRID: ApiEventGrid = {
  cell: 2,
  cells: [
    { lat: -20, lon: -176, count: 5000, maxMag: 8.4 },
    { lat: 34, lon: -120, count: 2, maxMag: null },
  ],
  query: QUERY,
};

/** An API whose window overflows the budget, so a catalog with a range set reports a raised floor of 6. */
export function raisedApi(events: ApiEvent[] = [event({ id: "big", mag: 6.4 })]): ApiClient {
  return fakeApi({
    events: vi.fn().mockResolvedValue(listOf(events)),
    summary: vi.fn().mockResolvedValue(RAISED_SUMMARY),
    grid: vi.fn().mockResolvedValue(RAISED_GRID),
  });
}
```

Keep the `status` and `geo` bodies exactly as they are today. Note `fakeApi` spreads `over` last, so an explicit `summary` or `grid` override still wins.

- [ ] **Step 5: Run the whole web suite**

Run: `pnpm --filter @tectonic/web test`
Expected: PASS (nothing uses `summary` yet; `fakeApi` still satisfies `ApiClient`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/test/lib/api.test.ts apps/web/test/support/api.ts
git commit -m "feat(web): summary and grid API calls with derived fakes"
```

---

### Task 3: Catalog window stats and floor choice

**Files:**

- Modify: `apps/web/src/lib/catalog.ts`
- Modify: `apps/web/test/support/mount.ts` (a `range` option)
- Test: `apps/web/test/lib/catalog.test.ts`

**Interfaces:**

- Consumes: `ApiClient.summary/grid`, `EventsFilterQuery` (Task 2).
- Produces: `WindowStats { floor; total; by; bins; grid }`, `chooseFloor(requested, bins, budget)`, `gridCellFor(region)`, `filterQueryFor(region, now, range, minMag)`, and on `Catalog`: `requested`, `stats`, `raised`, `windowTotal`; `floor` becomes the effective floor. `eventsQueryFor` is removed.

- [ ] **Step 1: Rewrite the affected catalog tests**

Replace the `eventsQueryFor` describe and add the floor tests at the top of `apps/web/test/lib/catalog.test.ts`:

```ts
import type { ApiEventList, ApiEventSummary, ApiSummaryBin } from "@tectonic/shared";
import { describe, expect, it, vi } from "vitest";
import {
  chooseFloor,
  createCatalog,
  EVENT_LIMIT,
  filterQueryFor,
  gridCellFor,
} from "../../src/lib/catalog.js";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { fakeApi, RAISED_SUMMARY, raisedApi } from "../support/api.js";
import { event, GLOBAL, WC } from "../support/events.js";

const now = () => new Date("2026-10-13T12:00:00Z");
const flush = () => new Promise((r) => setTimeout(r, 0));
const list = (id: string, truncated = false) => ({
  events: [event({ id })],
  count: 1,
  truncated,
  query: { since: "", until: null, minMag: null, bbox: null, limit: 1 },
});
const win = { since: "2026-10-01T00:00:00.000Z", until: "2026-10-05T23:59:59.999Z" };
const bin = (
  mags: Partial<ApiSummaryBin["mags"]>,
  over: Partial<ApiSummaryBin> = {},
): ApiSummaryBin => {
  const m = { lt4: 0, m4: 0, m5: 0, m6: 0, m7: 0, ...mags };
  return {
    start: "2000-01-01T00:00:00.000Z",
    count: m.lt4 + m.m4 + m.m5 + m.m6 + m.m7,
    maxMag: 6,
    mags: m,
    ...over,
  };
};

describe("filterQueryFor", () => {
  it("derives since, minMag and bbox from the preset, or the range when given", () => {
    expect(filterQueryFor(GLOBAL, now(), null, 4.5)).toEqual({
      since: "2026-10-06T12:00:00.000Z",
      minMag: 4.5,
    });
    expect(filterQueryFor(WC, now(), null, 2.5)).toEqual({
      since: "2026-09-13T12:00:00.000Z",
      minMag: 2.5,
      bbox: "-136,27,-104,53",
    });
    expect(filterQueryFor(GLOBAL, now(), win, 6)).toEqual({ ...win, minMag: 6 });
  });
});

describe("chooseFloor", () => {
  it("keeps the requested floor when the window fits", () => {
    expect(chooseFloor(4.5, [bin({ m4: 1500 }), bin({ m5: 500 })], 2000)).toBe(4.5);
    expect(chooseFloor(4.5, [], 2000)).toBe(4.5);
  });
  it("raises to the lowest whole band that fits, skipping bands below the request", () => {
    expect(chooseFloor(4.5, [bin({ m4: 2000, m5: 1000, m6: 100, m7: 1 })], 2000)).toBe(5);
    expect(chooseFloor(4.5, [bin({ m4: 2000, m5: 2000, m6: 100, m7: 1 })], 2000)).toBe(6);
    expect(chooseFloor(4.5, [bin({ m5: 2000, m6: 2000, m7: 10 })], 2000)).toBe(7);
    expect(chooseFloor(5.5, [bin({ m5: 1500, m6: 600 })], 2000)).toBe(6);
  });
  it("falls back to M7, or the request when that is higher, when nothing fits", () => {
    expect(chooseFloor(4.5, [bin({ m7: 3000 })], 2000)).toBe(7);
    expect(chooseFloor(7.5, [bin({ m7: 3000 })], 2000)).toBe(7.5);
  });
  it("sums the bands across bins", () => {
    expect(chooseFloor(4.5, RAISED_SUMMARY.bins, EVENT_LIMIT)).toBe(6);
  });
});

describe("gridCellFor", () => {
  it("uses 2° globally and 0.5° for a bounded view", () => {
    expect(gridCellFor(GLOBAL)).toBe(2);
    expect(gridCellFor(WC)).toBe(0.5);
  });
});
```

Then inside `describe("createCatalog")` add these tests (keep the existing ones):

```ts
it("loads a window through the summary, listing at the requested floor when it fits", async () => {
  const api = fakeApi();
  const c = createCatalog(api, now);
  await c.init();
  await c.setRegion("global");
  expect(c.stats.value).toBeNull();
  expect(c.windowTotal.value).toBe(1);
  c.setRange(win);
  await flush();
  expect(api.summary).toHaveBeenCalledWith({ ...win, minMag: 4.5 });
  expect(vi.mocked(api.events).mock.calls[1]?.[0]).toEqual({
    ...win,
    minMag: 4.5,
    limit: EVENT_LIMIT,
  });
  expect(api.grid).not.toHaveBeenCalled();
  expect(c.stats.value).toMatchObject({ floor: 4.5, total: 1, by: "day", grid: null });
  expect(c.raised.value).toBe(false);
  expect(c.floor.value).toBe(4.5);
  expect(c.windowTotal.value).toBe(1);
});
it("raises the floor from the bands and loads the density grid at the requested floor", async () => {
  const api = raisedApi();
  const c = createCatalog(api, now);
  await c.init();
  await c.setRegion("wc");
  c.setRange(win);
  await flush();
  expect(vi.mocked(api.events).mock.calls[1]?.[0]).toMatchObject({ minMag: 6 });
  expect(api.grid).toHaveBeenCalledWith({
    ...win,
    minMag: 2.5,
    bbox: "-136,27,-104,53",
    cell: 0.5,
  });
  expect(c.raised.value).toBe(true);
  expect(c.floor.value).toBe(6);
  expect(c.requested.value).toBe(2.5);
  expect(c.windowTotal.value).toBe(7312);
  expect(c.stats.value?.grid?.cells).toHaveLength(2);
  expect(c.windowEvents.value[0]?.id).toBe("big");
  c.setFilter({ ...EMPTY_FILTER, minMag: 6.5 });
  expect(c.floor.value).toBe(6.5);
  await flush();
  expect(api.summary).toHaveBeenLastCalledWith({ ...win, minMag: 6.5, bbox: "-136,27,-104,53" });
  expect(api.summary).toHaveBeenCalledTimes(2);
  c.setFilter({ ...EMPTY_FILTER, minMag: 6.5, maxDepth: 50 });
  await flush();
  expect(api.summary).toHaveBeenCalledTimes(2);
  c.setRange(null);
  expect(c.stats.value).toBeNull();
  c.setFilter({ ...EMPTY_FILTER, minMag: 7 });
  await flush();
  expect(api.summary).toHaveBeenCalledTimes(2);
});
it("keeps the old window and reports the error when the grid fails", async () => {
  const api = raisedApi();
  vi.mocked(api.grid).mockRejectedValueOnce(new Error("grid down"));
  const c = createCatalog(api, now);
  await c.init();
  await c.setRegion("global");
  c.setRange(win);
  await flush();
  expect(c.error.value).toBe("grid down");
  expect(c.stats.value).toBeNull();
  expect(c.windowEvents.value[0]?.id).toBe("us1");
  expect(c.loading.value).toBe(false);
});
```

Also rewrite the stale-answer part of "reports a failed range load, drops stale range answers, and waits for a region" so the deferred promises are on `summary` (the list is only requested after the summary answers):

```ts
let resolveFirst: (v: ApiEventSummary) => void = () => undefined;
let rejectSecond: (e: Error) => void = () => undefined;
vi.mocked(api.summary)
  .mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolveFirst = r;
      }),
  )
  .mockImplementationOnce(
    () =>
      new Promise((_, r) => {
        rejectSecond = r;
      }),
  );
c.setRange({ since: "2026-10-05T00:00:00.000Z", until: "2026-10-06T00:00:00.000Z" });
c.setRange({ since: "2026-10-07T00:00:00.000Z", until: "2026-10-08T00:00:00.000Z" });
c.setRange(null);
resolveFirst(RAISED_SUMMARY);
rejectSecond(new Error("stale failure"));
await flush();
expect(c.windowEvents.value[0]?.id).toBe("us1");
expect(c.error.value).toBeNull();
expect(api.events).toHaveBeenCalledTimes(3);
```

(`ApiEventList` stays imported for the "applies only the latest in-flight response" test.) Also add a stale-list case to that same test, after the block above:

```ts
let resolveList: (v: ApiEventList) => void = () => undefined;
vi.mocked(api.events).mockImplementationOnce(
  () =>
    new Promise((r) => {
      resolveList = r;
    }),
);
c.setRange({ since: "2026-10-09T00:00:00.000Z", until: "2026-10-10T00:00:00.000Z" });
await flush();
c.setRange(null);
resolveList(list("late"));
await flush();
expect(c.windowEvents.value[0]?.id).toBe("us1");
expect(c.stats.value).toBeNull();
```

- [ ] **Step 2: Run the catalog tests to see them fail**

Run: `pnpm --filter @tectonic/web test -- test/lib/catalog.test.ts`
Expected: FAIL (`chooseFloor` not exported).

- [ ] **Step 3: Rewrite `catalog.ts`**

```ts
import type { ApiEvent, ApiEventGrid, ApiRegion, ApiSummaryBin, SummaryBy } from "@tectonic/shared";
import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { errorMessage, type ApiClient, type EventsFilterQuery } from "./api.js";
import { applyFilter, EMPTY_FILTER, type EventFilter, type Range } from "./filters.js";

export const EVENT_LIMIT = 2000;

/** The server filter for a window: the range when given, else the preset's trailing days up to now. */
export function filterQueryFor(
  region: ApiRegion,
  now: Date,
  range: Range | null,
  minMag: number,
): EventsFilterQuery {
  const q: EventsFilterQuery = {
    since:
      range === null ? new Date(now.getTime() - region.days * 864e5).toISOString() : range.since,
    minMag,
  };
  if (range !== null) q.until = range.until;
  if (region.bbox !== null) {
    const b = region.bbox;
    q.bbox = `${String(b.minLon)},${String(b.minLat)},${String(b.maxLon)},${String(b.maxLat)}`;
  }
  return q;
}

/**
 * The lowest floor whose window count fits the budget: the requested floor
 * itself, else the summary's whole-magnitude bands at or above it (M5, M6,
 * M7). M7 when nothing fits, or the request when that is higher still.
 */
export function chooseFloor(requested: number, bins: ApiSummaryBin[], budget: number): number {
  const sum = (of: (b: ApiSummaryBin) => number): number => bins.reduce((a, b) => a + of(b), 0);
  const counts: [number, number][] = [
    [requested, sum((b) => b.count)],
    [5, sum((b) => b.mags.m5 + b.mags.m6 + b.mags.m7)],
    [6, sum((b) => b.mags.m6 + b.mags.m7)],
    [7, sum((b) => b.mags.m7)],
  ];
  for (const [m, n] of counts) if (m >= requested && n <= budget) return m;
  return Math.max(7, requested);
}

/** Density cell size in degrees: coarse for the world, finer for a bounded view. */
export function gridCellFor(region: ApiRegion): number {
  return region.bbox === null ? 2 : 0.5;
}

/** What the server said about the loaded window. */
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

export interface Catalog {
  regions: ShallowRef<ApiRegion[]>;
  region: ComputedRef<ApiRegion | null>;
  /** The preset window: feeds the summary tiles and the major-event cards. */
  events: ShallowRef<ApiEvent[]>;
  truncated: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  selectedId: Ref<string | null>;
  selected: ComputedRef<ApiEvent | null>;
  /** Magnitude and depth bounds applied to the map, table and charts. */
  filter: Ref<EventFilter>;
  /** The server-side date window of the map, table and charts; null only before a region is set. */
  range: Ref<Range | null>;
  /** The events of `range` when set, else the preset window. */
  windowEvents: ComputedRef<ApiEvent[]>;
  filtered: ComputedRef<ApiEvent[]>;
  /** The floor asked for: the preset's, raised by the filter minimum. */
  requested: ComputedRef<number>;
  /** The floor in force: `requested`, or the band the window was raised to so the list fits. */
  floor: ComputedRef<number>;
  /** The loaded window's summary and density; null until a range has loaded. */
  stats: ShallowRef<WindowStats | null>;
  /** True when the list floor is above the requested one. */
  raised: ComputedRef<boolean>;
  /** Events in the window at the requested floor, else the loaded count. */
  windowTotal: ComputedRef<number>;
  setFilter(f: EventFilter): void;
  setRange(r: Range | null): void;
  /** The active region; throws when none is set (components below the region guard never see that). */
  requireRegion(): ApiRegion;
  /** Loads the region presets. */
  init(): Promise<void>;
  /** Switches region and loads its events; false when the id is unknown. */
  setRegion(id: string): Promise<boolean>;
  select(id: string | null): void;
  /** Reloads the current region's events, keeping the selection. */
  refetch(): Promise<void>;
}

const sameRange = (a: Range | null, b: Range | null): boolean =>
  a === b || (a !== null && b !== null && a.since === b.since && a.until === b.until);

export function createCatalog(api: ApiClient, now: () => Date): Catalog {
  const regions = shallowRef<ApiRegion[]>([]);
  const regionId = ref<string | null>(null);
  const events = shallowRef<ApiEvent[]>([]);
  const rangeEvents = shallowRef<ApiEvent[] | null>(null);
  const stats = shallowRef<WindowStats | null>(null);
  const truncated = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const region = computed(() => regions.value.find((r) => r.id === regionId.value) ?? null);
  const selected = computed(() => events.value.find((e) => e.id === selectedId.value) ?? null);
  const filter = ref<EventFilter>(EMPTY_FILTER);
  const range = ref<Range | null>(null);
  const windowEvents = computed(() => rangeEvents.value ?? events.value);
  const filtered = computed(() => applyFilter(windowEvents.value, filter.value));
  const requested = computed(() => {
    const base = region.value?.minMag ?? 0;
    const min = filter.value.minMag;
    return min === null ? base : Math.max(base, min);
  });
  const floor = computed(() => {
    const s = stats.value;
    return s === null ? requested.value : Math.max(s.floor, requested.value);
  });
  const raised = computed(() => floor.value > requested.value);
  const windowTotal = computed(() => stats.value?.total ?? windowEvents.value.length);
  let seq = 0;
  let rangeSeq = 0;

  async function load(r: ApiRegion): Promise<void> {
    const token = ++seq;
    loading.value = true;
    error.value = null;
    try {
      const list = await api.events({
        ...filterQueryFor(r, now(), null, r.minMag),
        limit: EVENT_LIMIT,
      });
      if (token !== seq) return;
      events.value = list.events;
      if (range.value === null) truncated.value = list.truncated;
    } catch (e) {
      if (token !== seq) return;
      error.value = errorMessage(e);
    } finally {
      if (token === seq) loading.value = false;
    }
  }

  async function loadRange(r: ApiRegion, win: Range): Promise<void> {
    const token = ++rangeSeq;
    loading.value = true;
    error.value = null;
    try {
      const req = requested.value;
      const base = filterQueryFor(r, now(), win, req);
      const s = await api.summary(base);
      if (token !== rangeSeq) return;
      const lower = chooseFloor(req, s.bins, EVENT_LIMIT);
      const [list, grid] = await Promise.all([
        api.events({ ...base, minMag: lower, limit: EVENT_LIMIT }),
        lower > req ? api.grid({ ...base, cell: gridCellFor(r) }) : Promise.resolve(null),
      ]);
      if (token !== rangeSeq) return;
      rangeEvents.value = list.events;
      truncated.value = list.truncated;
      stats.value = {
        floor: lower,
        total: s.bins.reduce((a, b) => a + b.count, 0),
        by: s.by,
        bins: s.bins,
        grid,
      };
    } catch (e) {
      if (token !== rangeSeq) return;
      error.value = errorMessage(e);
    } finally {
      if (token === rangeSeq) loading.value = false;
    }
  }

  async function loadAll(r: ApiRegion): Promise<void> {
    const win = range.value;
    await Promise.all([load(r), win === null ? Promise.resolve() : loadRange(r, win)]);
  }

  function dropRange(): void {
    rangeSeq += 1;
    rangeEvents.value = null;
    stats.value = null;
  }

  return {
    regions,
    region,
    events,
    truncated,
    loading,
    error,
    selectedId,
    selected,
    filter,
    range,
    windowEvents,
    filtered,
    requested,
    floor,
    stats,
    raised,
    windowTotal,
    setFilter(f) {
      const before = requested.value;
      filter.value = f;
      const reg = region.value;
      const win = range.value;
      if (requested.value === before || reg === null || win === null) return;
      void loadRange(reg, win);
    },
    setRange(r) {
      if (sameRange(range.value, r)) return;
      range.value = r;
      dropRange();
      const reg = region.value;
      if (r === null || reg === null) return;
      void loadRange(reg, r);
    },
    requireRegion() {
      const r = region.value;
      if (r === null) throw new Error("no region selected");
      return r;
    },
    async init() {
      try {
        regions.value = await api.regions();
      } catch (e) {
        error.value = errorMessage(e);
      }
    },
    async setRegion(id) {
      const r = regions.value.find((x) => x.id === id);
      if (r === undefined) return false;
      if (regionId.value === id) return true;
      regionId.value = id;
      selectedId.value = null;
      events.value = [];
      dropRange();
      truncated.value = false;
      await loadAll(r);
      return true;
    },
    select(id) {
      selectedId.value = id;
    },
    async refetch() {
      const r = region.value;
      if (r !== null) await loadAll(r);
    },
  };
}
```

Note `setRegion` previously did not bump `rangeSeq`; `dropRange` now does, which the existing "applies only the latest in-flight response" test still satisfies because `loadAll` starts a fresh `loadRange` afterwards.

- [ ] **Step 4: Give `makeContext` a `range` option**

In `apps/web/test/support/mount.ts`, extend the options and apply the range after `setRegion`:

```ts
import type { EventFilter, Range } from "../../src/lib/filters.js";
// ...
export async function makeContext(
  over: { api?: ApiClient; now?: Date; regionId?: string; volcanoes?: boolean; range?: Range } = {},
): Promise<Context> {
  // ... after `await catalog.setRegion(over.regionId ?? "global");`
  if (over.range !== undefined) {
    catalog.setRange(over.range);
    await new Promise((r) => setTimeout(r, 0));
  }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @tectonic/web test`
Expected: PASS. If `App.test.ts` or `QuakeMap.test.ts` count `api.events` calls, the counts are unchanged (one list per preset load, one per range load).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/catalog.ts apps/web/test/lib/catalog.test.ts apps/web/test/support/mount.ts
git commit -m "feat(web): load windows through the summary, raising the floor to fit the budget"
```

---

### Task 4: Era marks and the overview time chart

**Files:**

- Create: `apps/web/src/lib/eras.ts`
- Modify: `apps/web/src/lib/format.ts` (`fmtFloor`)
- Modify: `apps/web/src/components/ChartAxes.vue`
- Modify: `apps/web/src/components/MagnitudeTimeChart.vue`
- Test: `apps/web/test/lib/eras.test.ts` (new), `apps/web/test/lib/format.test.ts`, `apps/web/test/components/ChartAxes.test.ts`, `apps/web/test/components/MagnitudeTimeChart.test.ts`

**Interfaces:**

- Consumes: `catalog.stats`, `catalog.raised`, `catalog.requested` (Task 3).
- Produces: `Era { year; label; note }`, `ERAS`, `eraStart(era): Date`, `erasWithin(from, to): Era[]`, `fmtFloor(m: number): string` (`"M4.5+"`, `"M6+"`), `ChartAxes` prop `yRightTicks?: Tick[]`.

- [ ] **Step 1: Write the eras and format tests**

`apps/web/test/lib/eras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ERAS, eraStart, erasWithin } from "../../src/lib/eras.js";

describe("eras", () => {
  it("lists the three catalogue breaks with their notes", () => {
    expect(ERAS.map((e) => [e.year, e.label])).toEqual([
      [1964, "WWSSN"],
      [1973, "PDE"],
      [1976, "GCMT"],
    ]);
    expect(eraStart(ERAS[0] ?? { year: 0, label: "", note: "" }).toISOString()).toBe(
      "1964-01-01T00:00:00.000Z",
    );
  });
  it("returns the eras whose start lies inside a closed window", () => {
    const years = (from: string, to: string) =>
      erasWithin(new Date(from), new Date(to)).map((e) => e.year);
    expect(years("1900-01-01T00:00:00Z", "2026-10-13T00:00:00Z")).toEqual([1964, 1973, 1976]);
    expect(years("1964-01-01T00:00:00Z", "1976-01-01T00:00:00Z")).toEqual([1964, 1973, 1976]);
    expect(years("1964-01-01T00:00:01Z", "1975-12-31T00:00:00Z")).toEqual([1973]);
    expect(years("2026-09-13T00:00:00Z", "2026-10-13T00:00:00Z")).toEqual([]);
  });
});
```

In `apps/web/test/lib/format.test.ts` add (importing `fmtFloor`):

```ts
it("names a magnitude floor without trailing zeros", () => {
  expect(fmtFloor(4.5)).toBe("M4.5+");
  expect(fmtFloor(6)).toBe("M6+");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @tectonic/web test -- test/lib/eras.test.ts test/lib/format.test.ts`
Expected: FAIL (module not found; `fmtFloor` missing).

- [ ] **Step 3: Implement `eras.ts` and `fmtFloor`**

`apps/web/src/lib/eras.ts`:

```ts
/** A change in the earthquake record itself, drawn on the time chart so a step in the counts reads as detection, not seismicity. */
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

export function eraStart(era: Era): Date {
  return new Date(Date.UTC(era.year, 0, 1));
}

/** The eras whose first instant lies in `[from, to]`. */
export function erasWithin(from: Date, to: Date): Era[] {
  return ERAS.filter((e) => {
    const t = eraStart(e).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
}
```

`format.ts`, after `fmtMag`:

```ts
/** "M4.5+" or "M6+": a magnitude floor as the page names it. */
export function fmtFloor(m: number): string {
  return `M${String(m)}+`;
}
```

- [ ] **Step 4: Right axis on `ChartAxes`**

Props gain `yRightTicks?: Tick[]` with default `() => []`:

```ts
withDefaults(
  defineProps<{
    xTicks: Tick[];
    yTicks: Tick[];
    yRightTicks?: Tick[];
    width: number;
    height: number;
    margin: { l: number; r: number; t: number; b: number };
    grid?: boolean;
  }>(),
  { yRightTicks: () => [], grid: true },
);
```

Template, after the left-axis group:

```vue
    <g v-if="yRightTicks.length > 0" class="axis">
      <line :x1="width - margin.r" :x2="width - margin.r" :y1="margin.t" :y2="height - margin.b" />
      <g v-for="t in yRightTicks" :key="t.pos">
        <line :x1="width - margin.r" :x2="width - margin.r + 5" :y1="t.pos" :y2="t.pos" />
        <text :x="width - margin.r + 8" :y="t.pos" dy="0.32em" text-anchor="start">
          {{ t.label }}
        </text>
      </g>
    </g>
```

Test (`ChartAxes.test.ts`):

```ts
it("draws a right axis only when given ticks", () => {
  expect(mount(ChartAxes, { props }).findAll(".axis")).toHaveLength(2);
  const w = mount(ChartAxes, { props: { ...props, yRightTicks: [{ pos: 30, label: "M7" }] } });
  expect(w.findAll(".axis")).toHaveLength(3);
  expect(w.findAll(".axis text").map((t) => t.text())).toEqual(["a", "b", "1", "M7"]);
});
```

- [ ] **Step 5: Rewrite `MagnitudeTimeChart.vue`**

```vue
<script setup lang="ts">
import type { ApiEvent, SummaryBy } from "@tectonic/shared";
import { scaleLinear, scaleTime, scaleUtc } from "d3-scale";
import { computed } from "vue";
import ChartAxes from "./ChartAxes.vue";
import { ticksOf } from "../lib/charts.js";
import { depthColor } from "../lib/depth.js";
import { eraStart, erasWithin, type Era } from "../lib/eras.js";
import { fmtFloor, fmtInt, fmtMag, placeOf } from "../lib/format.js";
import { CATALOG, CLOCK, SELECT, useInjected, ZONE } from "../lib/keys.js";
import { sequenceOf } from "../lib/sequence.js";

const W = 520;
const H = 200;
const M = { l: 34, r: 10, t: 8, b: 24 };
/** Right margin in overview mode, which carries a magnitude axis on the right. */
const MR = 36;
/** Windows longer than this get d3's multi-scale tick labels instead of "Oct 7". */
const SHORT_DAYS = 120;

type Dated = ApiEvent & { mag: number };
interface EraMark {
  era: Era;
  x: number;
}

const catalog = useInjected(CATALOG);
const clock = useInjected(CLOCK);
const select = useInjected(SELECT);
const zone = useInjected(ZONE);

/** The loaded window, never reaching past now. */
const domain = computed<[Date, Date]>(() => {
  const now = clock.now.value;
  const win = catalog.range.value;
  if (win !== null) {
    return [new Date(win.since), new Date(Math.min(Date.parse(win.until), now.getTime()))];
  }
  return [new Date(now.getTime() - catalog.requireRegion().days * 864e5), now];
});
const spanDays = computed(() => (domain.value[1].getTime() - domain.value[0].getTime()) / 864e5);

function xScale(right: number) {
  return (zone.value === "utc" ? scaleUtc() : scaleTime())
    .domain(domain.value)
    .range([M.l, W - right]);
}
function xTicks(x: ReturnType<typeof xScale>, count: number) {
  return ticksOf(x, count, spanDays.value <= SHORT_DAYS ? "%b %-d" : undefined);
}
function eraMarks(x: (d: Date) => number): EraMark[] {
  return erasWithin(domain.value[0], domain.value[1]).map((era) => ({ era, x: x(eraStart(era)) }));
}
function erasSentence(marks: EraMark[]): string {
  if (marks.length === 0) return "";
  const list = marks.map((m) => `${String(m.era.year)} (${m.era.note})`).join("; ");
  return ` Dashed lines mark changes in the record, not in the Earth: ${list}.`;
}

function binEnd(start: Date, by: SummaryBy): Date {
  const d = new Date(start);
  if (by === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else if (by === "month") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
const binLabel = (start: string, by: SummaryBy): string =>
  start.slice(0, by === "year" ? 4 : by === "month" ? 7 : 10);

/** Overview mode: one bar and one dot per summary bin, when the floor was raised. */
const overview = computed(() => {
  const s = catalog.stats.value;
  if (s === null || !catalog.raised.value) return null;
  const x = xScale(MR);
  const requested = catalog.requested.value;
  const bins = s.bins;
  const yCount = scaleLinear()
    .domain([0, Math.max(1, ...bins.map((b) => b.count))])
    .nice()
    .range([H - M.b, M.t]);
  const mags = bins.flatMap((b) => (b.maxMag === null ? [] : [b.maxMag]));
  const yMag = scaleLinear()
    .domain([requested, Math.ceil(Math.max(requested + 1, ...mags))])
    .nice()
    .range([H - M.b, M.t]);
  const edges = bins.map((b) => {
    const start = new Date(b.start);
    return { b, x0: x(start), x1: x(binEnd(start, s.by)) };
  });
  const bars = edges.map(({ b, x0, x1 }) => ({
    key: b.start,
    x: x0,
    w: Math.max(1, x1 - x0 - 1),
    y: yCount(b.count),
    h: H - M.b - yCount(b.count),
  }));
  const dots = edges.flatMap(({ b, x0, x1 }) =>
    b.maxMag === null
      ? []
      : [
          {
            key: b.start,
            x: (x0 + x1) / 2,
            y: yMag(b.maxMag),
            title: `${binLabel(b.start, s.by)}: ${fmtInt(b.count)} events, largest M${fmtMag(b.maxMag)}`,
          },
        ],
  );
  const marks = eraMarks(x);
  const utc = zone.value === "local" ? " Bins are UTC." : "";
  return {
    bars,
    dots,
    marks,
    xTicks: xTicks(x, 7),
    yTicks: ticksOf(yCount, 5, "~s"),
    yRight: ticksOf(yMag, 5),
    caption: `Bars count events per ${s.by} at ${fmtFloor(requested)}; dots are the largest in each.${erasSentence(marks)}${utc}`,
  };
});

/** Per-event mode: a stem per event, when the whole window is loaded. */
const data = computed(() => {
  if (overview.value !== null) return null;
  const region = catalog.requireRegion();
  const all = catalog.filtered.value;
  const evs = all.filter((e): e is Dated => e.mag !== null);
  if (evs.length === 0) return null;
  const now = clock.now.value;
  const x = xScale(M.r);
  const y = scaleLinear()
    .domain([catalog.floor.value, Math.ceil(Math.max(...evs.map((e) => e.mag)))])
    .nice()
    .range([H - M.b, M.t]);
  const marks = [...evs]
    .sort((a, b) => a.mag - b.mag)
    .map((e) => ({ e, x: x(new Date(e.time)), y: y(e.mag) }));
  const big = evs.reduce((a, e) => (e.mag > a.mag ? e : a));
  const seq = sequenceOf(big, all, now);
  const share = seq === null ? 0 : Math.round(((seq.count + 1) / all.length) * 100);
  const eras = eraMarks(x);
  const caption =
    seq === null
      ? "Each stem is one event; colour is depth class."
      : `The M${fmtMag(big.mag)} ${placeOf(big).replace(/^.* of /, "")} event and its ${String(seq.count)} following events within 150 km account for ${String(share)}% of this window.`;
  return {
    marks,
    eras,
    xTicks: xTicks(x, region.id === "global" ? 7 : 6),
    yTicks: ticksOf(y, 5),
    caption: caption + erasSentence(eras),
  };
});

const caption = computed(
  () => overview.value?.caption ?? data.value?.caption ?? "No events in this window.",
);
</script>

<template>
  <div class="panel chart">
    <h2>Magnitude through time</h2>
    <svg :viewBox="`0 0 ${String(W)} ${String(H)}`">
      <template v-if="overview !== null">
        <ChartAxes
          :x-ticks="overview.xTicks"
          :y-ticks="overview.yTicks"
          :y-right-ticks="overview.yRight"
          :width="W"
          :height="H"
          :margin="{ ...M, r: MR }"
        />
        <rect
          v-for="b in overview.bars"
          :key="b.key"
          class="bin"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          style="fill: var(--border)"
          opacity="0.7"
        />
        <g v-for="m in overview.marks" :key="m.era.year" class="era">
          <line
            :x1="m.x"
            :x2="m.x"
            :y1="M.t"
            :y2="H - M.b"
            style="stroke: var(--muted)"
            stroke-dasharray="3 3"
          />
          <text :x="m.x + 3" :y="M.t + 9" style="fill: var(--muted); font: 10px var(--f-data)">
            {{ m.era.label }}
          </text>
        </g>
        <circle
          v-for="d in overview.dots"
          :key="d.key"
          class="binmax"
          :cx="d.x"
          :cy="d.y"
          r="3"
          style="fill: var(--accent)"
        >
          <title>{{ d.title }}</title>
        </circle>
      </template>
      <template v-else-if="data !== null">
        <ChartAxes
          :x-ticks="data.xTicks"
          :y-ticks="data.yTicks"
          :width="W"
          :height="H"
          :margin="M"
        />
        <g v-for="m in data.eras" :key="m.era.year" class="era">
          <line
            :x1="m.x"
            :x2="m.x"
            :y1="M.t"
            :y2="H - M.b"
            style="stroke: var(--muted)"
            stroke-dasharray="3 3"
          />
          <text :x="m.x + 3" :y="M.t + 9" style="fill: var(--muted); font: 10px var(--f-data)">
            {{ m.era.label }}
          </text>
        </g>
        <line
          v-for="m in data.marks"
          :key="`s${m.e.id}`"
          class="stem"
          :x1="m.x"
          :x2="m.x"
          :y1="H - M.b"
          :y2="m.y"
          style="stroke: var(--border)"
          stroke-width="0.6"
        />
        <circle
          v-for="m in data.marks"
          :key="m.e.id"
          :cx="m.x"
          :cy="m.y"
          :r="m.e.id === catalog.selectedId.value ? 5 : 3"
          :style="{
            fill: depthColor(m.e.depthKm),
            stroke: m.e.id === catalog.selectedId.value ? 'var(--ink)' : 'none',
            cursor: 'pointer',
          }"
          stroke-width="1.5"
          @click="select(m.e.id)"
        >
          <title>M{{ fmtMag(m.e.mag) }} {{ placeOf(m.e) }}</title>
        </circle>
      </template>
    </svg>
    <div class="cap">{{ caption }}</div>
  </div>
</template>
```

The per-event x-domain now starts at the window start rather than the first event, so the era lines land where the window says.

- [ ] **Step 6: Extend the chart tests**

In `MagnitudeTimeChart.test.ts` add imports `raisedApi` and a `Range` constant, then:

```ts
const century = { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" };

it("draws per-bin bars and maxima with era marks when the floor was raised", async () => {
  const ctx = await makeContext({ api: raisedApi(), range: century });
  const w = mountWith(MagnitudeTimeChart, ctx);
  expect(w.findAll("rect.bin")).toHaveLength(2);
  expect(w.findAll("circle.binmax")).toHaveLength(1);
  expect(w.find("circle.binmax title").text()).toBe("1964: 3,910 events, largest M8.4");
  expect(w.findAll("g.era")).toHaveLength(3);
  expect(w.findAll("g.era text").map((t) => t.text())).toEqual(["WWSSN", "PDE", "GCMT"]);
  expect(w.findAll(".axis")).toHaveLength(3);
  expect(w.find(".cap").text()).toBe(
    "Bars count events per year at M4.5+; dots are the largest in each. Dashed lines mark changes in the record, not in the Earth: 1964 (WWSSN network and ISC founded; global record complete to about M5.5–6); 1973 (NEIC PDE enters ComCat; complete to about M4.5); 1976 (Global CMT begins; Mw measured rather than proxied above about M5).",
  );
  ctx.zone.value = "local";
  await nextTick();
  expect(w.find(".cap").text()).toContain(" Bins are UTC.");
});
it("marks the eras in per-event mode too, and only when they fall in the window", async () => {
  const ctx = await makeContext({
    range: { since: "1975-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
  });
  const w = mountWith(MagnitudeTimeChart, ctx);
  expect(w.findAll("line.stem")).toHaveLength(1);
  expect(w.findAll("g.era text").map((t) => t.text())).toEqual(["GCMT"]);
  expect(w.find(".cap").text()).toContain("1976 (Global CMT begins");
  expect(w.findAll(".axis text").some((t) => /^\d{4}$/.test(t.text()))).toBe(true);
  const short = await chart([after, main]);
  expect(short.w.findAll("g.era")).toHaveLength(0);
});
```

The existing "ends the axis at the date range's last day" test still holds.

- [ ] **Step 7: Run the tests**

Run: `pnpm --filter @tectonic/web test -- test/lib/eras.test.ts test/lib/format.test.ts test/components/ChartAxes.test.ts test/components/MagnitudeTimeChart.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/eras.ts apps/web/src/lib/format.ts apps/web/src/components/ChartAxes.vue apps/web/src/components/MagnitudeTimeChart.vue apps/web/test/lib/eras.test.ts apps/web/test/lib/format.test.ts apps/web/test/components/ChartAxes.test.ts apps/web/test/components/MagnitudeTimeChart.test.ts
git commit -m "feat(web): overview time chart with per-bin counts and era marks"
```

---

### Task 5: Refine note, table heading and b-value caption

**Files:**

- Modify: `apps/web/src/components/FilterBar.vue`, `apps/web/src/components/CatalogTable.vue`, `apps/web/src/components/FrequencyMagnitudeChart.vue`, `apps/web/src/styles.css`
- Test: `apps/web/test/components/FilterBar.test.ts`, `CatalogTable.test.ts`, `FrequencyMagnitudeChart.test.ts`

**Interfaces:**

- Consumes: `catalog.stats`, `raised`, `requested`, `floor`, `windowTotal`; `fmtFloor`, `fmtInt`.

- [ ] **Step 1: Tests first**

FilterBar:

```ts
it("explains a raised floor under the inputs", async () => {
  const plain = mountWith(FilterBar, await makeContext());
  expect(plain.find(".fnote").exists()).toBe(false);
  const w = mountWith(
    FilterBar,
    await makeContext({
      api: raisedApi(),
      range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
    }),
  );
  expect(w.find(".fnote").text()).toBe(
    "This window holds 7,312 events at M4.5+. Markers, table and the magnitude charts show the 1 at M6+ so the page stays responsive; the density shading and the time chart cover all of them.",
  );
  expect(w.findAll("input")[0]?.element.value).toBe("4.5");
});
```

CatalogTable:

```ts
it("counts against the window total when the floor was raised", async () => {
  const ctx = await makeContext({
    api: raisedApi(),
    range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
  });
  const w = mountWith(CatalogTable, ctx);
  expect(w.find("h2").text()).toContain("1 of 7,312 events");
});
```

FrequencyMagnitudeChart:

```ts
it("names the window floor as Mc when the floor was raised", async () => {
  const ctx = await makeContext({
    api: raisedApi([event({ id: "x", mag: 6.4 }), event({ id: "y", mag: 7.1 })]),
    range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
  });
  const w = mountWith(FrequencyMagnitudeChart, ctx);
  expect(w.find(".cap").text()).toContain("Mc taken as the 6 window floor");
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @tectonic/web test -- test/components/FilterBar.test.ts test/components/CatalogTable.test.ts test/components/FrequencyMagnitudeChart.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

FilterBar script adds:

```ts
import { fmtFloor, fmtInt } from "../lib/format.js";
// ...
/** Why the page shows fewer events than the window holds. */
const note = computed(() => {
  const s = catalog.stats.value;
  if (s === null || !catalog.raised.value) return null;
  return `This window holds ${fmtInt(s.total)} events at ${fmtFloor(catalog.requested.value)}. Markers, table and the magnitude charts show the ${fmtInt(catalog.windowEvents.value.length)} at ${fmtFloor(catalog.floor.value)} so the page stays responsive; the density shading and the time chart cover all of them.`;
});
```

The magnitude input's `:value` becomes `String(catalog.requested.value)` (the floor the reader controls). Template, after the Reset button inside the section:

```vue
<p v-if="note !== null" class="fnote">{{ note }}</p>
```

`styles.css`:

```css
.filters .fnote {
  flex-basis: 100%;
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 12.5px;
}
```

CatalogTable: replace `const { events: all, filtered: events, selectedId } = useInjected(CATALOG);` with

```ts
const catalog = useInjected(CATALOG);
const { filtered: events, selectedId, windowTotal } = catalog;
```

import `fmtInt`, and the heading:

```vue
<span
  v-if="events.length !== windowTotal"
>{{ events.length }} of {{ fmtInt(windowTotal) }} events · tap a row for detail</span>
```

FrequencyMagnitudeChart: `const raised = mc > region.minMag;` becomes

```ts
const mcSource = catalog.raised.value
  ? "window floor"
  : mc > region.minMag
    ? "filter minimum"
    : "catalog floor";
```

and the caption uses `Mc taken as the ${String(mc)} ${mcSource}`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @tectonic/web test -- test/components/FilterBar.test.ts test/components/CatalogTable.test.ts test/components/FrequencyMagnitudeChart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/FilterBar.vue apps/web/src/components/CatalogTable.vue apps/web/src/components/FrequencyMagnitudeChart.vue apps/web/src/styles.css apps/web/test/components/FilterBar.test.ts apps/web/test/components/CatalogTable.test.ts apps/web/test/components/FrequencyMagnitudeChart.test.ts
git commit -m "feat(web): say when the floor was raised in the Refine bar, table and b-value caption"
```

---

### Task 6: Density layer on the map

**Files:**

- Create: `apps/web/src/lib/density.ts`, `apps/web/src/components/MapDensity.vue`
- Modify: `apps/web/src/components/MapLegend.vue`, `MapShell.vue`, `QuakeMap.vue`
- Test: `apps/web/test/lib/density.test.ts` (new), `apps/web/test/components/MapDensity.test.ts` (new), `MapLegend.test.ts`, `QuakeMap.test.ts`

**Interfaces:**

- Produces: `density.ts`: `DENSITY_RAMP: readonly number[]` (`[0.08, 0.25, 0.42, 0.58, 0.75]`), `densityOpacity(max: number): (count: number) => number`, `cellRing(lat, lon, cell): Polygon`, `DensityLegend { cell; floor; max }`, `densityLegendFor(grid: ApiEventGrid, floor: number): DensityLegend`. `MapDensity` props `{ path: (o: GeoPermissibleObjects) => string | null; grid: ApiEventGrid }`. `MapLegend`/`MapShell` prop `density?: DensityLegend | null`.

- [ ] **Step 1: Tests**

`apps/web/test/lib/density.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cellRing, DENSITY_RAMP, densityLegendFor, densityOpacity } from "../../src/lib/density.js";
import { RAISED_GRID } from "../support/api.js";

describe("density", () => {
  it("maps counts to opacity on a log scale between the ramp ends", () => {
    const o = densityOpacity(1000);
    expect(o(1)).toBeCloseTo(DENSITY_RAMP[0] ?? 0, 5);
    expect(o(1000)).toBeCloseTo(DENSITY_RAMP[4] ?? 0, 5);
    expect(o(10)).toBeGreaterThan(o(1));
    expect(o(5000)).toBeCloseTo(DENSITY_RAMP[4] ?? 0, 5);
    expect(densityOpacity(1)(1)).toBeCloseTo(DENSITY_RAMP[4] ?? 0, 5);
  });
  it("builds a clockwise ring from the south-west corner", () => {
    expect(cellRing(34, -120, 0.5).coordinates).toEqual([
      [
        [-120, 34],
        [-120, 34.5],
        [-119.5, 34.5],
        [-119.5, 34],
        [-120, 34],
      ],
    ]);
  });
  it("summarises a grid for the legend", () => {
    expect(densityLegendFor(RAISED_GRID, 4.5)).toEqual({ cell: 2, floor: 4.5, max: 5000 });
    expect(densityLegendFor({ ...RAISED_GRID, cells: [] }, 4.5).max).toBe(1);
  });
});
```

`apps/web/test/components/MapDensity.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import MapDensity from "../../src/components/MapDensity.vue";
import { frameFor } from "../../src/lib/geo.js";
import { RAISED_GRID } from "../support/api.js";
import { GLOBAL } from "../support/events.js";

describe("MapDensity", () => {
  it("draws one path per cell, darker where the count is higher, and skips cells that do not project", () => {
    const path = geoPath(frameFor(GLOBAL).projection);
    const w = mount(MapDensity, { props: { path, grid: RAISED_GRID } });
    const paths = w.findAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]?.attributes("d")).toMatch(/^M/);
    const op = (i: number) => Number(paths[i]?.attributes("fill-opacity"));
    expect(op(0)).toBeGreaterThan(op(1));
    expect(w.find("g.density").attributes("style")).toContain("pointer-events: none");
    const blind = mount(MapDensity, { props: { path: () => null, grid: RAISED_GRID } });
    expect(blind.findAll("path")).toHaveLength(0);
  });
});
```

MapLegend test addition:

```ts
it("adds a density row when given one", () => {
  const w = mount(MapLegend, {
    props: { frame: frameFor(GLOBAL), minMag: 4.5, density: { cell: 2, floor: 4.5, max: 5000 } },
  });
  expect(w.text()).toContain("events per 2° cell at M4.5+: 1 → 5,000 (log scale)");
  expect(w.findAll("rect")).toHaveLength(5);
});
```

QuakeMap test addition (uses `stubWorld`, `flushPromises` already imported):

```ts
it("shades density under the markers when the floor was raised, with a toggle and legend row", async () => {
  stubWorld();
  const ctx = await makeContext({
    api: raisedApi(),
    range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
  });
  const w = mountWith(QuakeMap, ctx, { animate: false });
  await flushPromises();
  expect(w.find(".mapcount").text()).toBe("Showing 1 of 7,312 events · markers at M6+");
  expect(w.findComponent({ name: "MapDensity" }).findAll("path")).toHaveLength(2);
  expect(w.text()).toContain("events per 2° cell at M4.5+: 1 → 5,000 (log scale)");
  const toggle = w.findAll(".maptools label").find((l) => l.text().includes("Density"));
  await toggle?.find("input").setValue(false);
  expect(w.findComponent({ name: "MapDensity" }).exists()).toBe(false);
  expect(w.text()).not.toContain("events per 2° cell");
  w.unmount();
});
it("offers no density toggle when the whole window is loaded", async () => {
  stubWorld();
  const w = mountWith(QuakeMap, await makeContext(), { animate: false });
  await flushPromises();
  expect(w.findAll(".maptools label").some((l) => l.text().includes("Density"))).toBe(false);
  w.unmount();
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @tectonic/web test -- test/lib/density.test.ts test/components/MapDensity.test.ts test/components/MapLegend.test.ts test/components/QuakeMap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `density.ts`**

```ts
import type { ApiEventGrid } from "@tectonic/shared";
import { scaleLog } from "d3-scale";
import type { Polygon } from "geojson";

/** Fill opacities of the legend ramp, lightest to darkest; the layer interpolates between the ends. */
export const DENSITY_RAMP: readonly number[] = [0.08, 0.25, 0.42, 0.58, 0.75];

const LOW = DENSITY_RAMP[0] ?? 0.08;
const HIGH = DENSITY_RAMP[DENSITY_RAMP.length - 1] ?? 0.75;

/** Opacity for a cell count, log-scaled from 1 to the grid's largest count. */
export function densityOpacity(max: number): (count: number) => number {
  if (max <= 1) return () => HIGH;
  const s = scaleLog().domain([1, max]).range([LOW, HIGH]).clamp(true);
  return (count) => s(count);
}

/** A cell as a clockwise spherical ring from its south-west corner, as d3-geo expects for small polygons. */
export function cellRing(lat: number, lon: number, cell: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon, lat],
        [lon, lat + cell],
        [lon + cell, lat + cell],
        [lon + cell, lat],
        [lon, lat],
      ],
    ],
  };
}

export interface DensityLegend {
  cell: number;
  floor: number;
  max: number;
}

export function densityLegendFor(grid: ApiEventGrid, floor: number): DensityLegend {
  return { cell: grid.cell, floor, max: Math.max(1, ...grid.cells.map((c) => c.count)) };
}
```

- [ ] **Step 4: `MapDensity.vue`**

```vue
<script setup lang="ts">
import type { ApiEventGrid } from "@tectonic/shared";
import type { GeoPermissibleObjects } from "d3-geo";
import { computed } from "vue";
import { cellRing, densityOpacity } from "../lib/density.js";

/** Grid cells shaded by count under the markers. Not interactive: pointer events pass through. */
const props = defineProps<{
  path: (object: GeoPermissibleObjects) => string | null;
  grid: ApiEventGrid;
}>();

const cells = computed(() => {
  const { cell, cells: list } = props.grid;
  const opacity = densityOpacity(Math.max(1, ...list.map((c) => c.count)));
  return list.flatMap((c) => {
    const d = props.path(cellRing(c.lat, c.lon, cell));
    return d === null
      ? []
      : [{ key: `${String(c.lat)},${String(c.lon)}`, d, opacity: opacity(c.count) }];
  });
});
</script>

<template>
  <g class="density" style="pointer-events: none">
    <path
      v-for="c in cells"
      :key="c.key"
      :d="c.d"
      :fill-opacity="c.opacity"
      style="fill: var(--accent)"
    />
  </g>
</template>
```

- [ ] **Step 5: Legend row, shell passthrough, map wiring**

`MapLegend.vue` props gain `density?: DensityLegend | null` (default `null`); import `DENSITY_RAMP, type DensityLegend` from `../lib/density.js` and `fmtFloor, fmtInt` from `../lib/format.js`. Inside the `v-if="quakes"` template, after the beachball note:

```vue
<span v-if="density !== null" class="sw">
        <svg width="52" height="10" aria-hidden="true">
          <rect
            v-for="(o, i) in DENSITY_RAMP"
            :key="i"
            :x="i * 10"
            y="0"
            width="10"
            height="10"
            :fill-opacity="o"
            style="fill: var(--accent)"
          />
        </svg>
        events per {{ density.cell }}° cell at {{ fmtFloor(density.floor) }}: 1 →
        {{ fmtInt(density.max) }} (log scale)
      </span>
```

`MapShell.vue` props gain `density?: DensityLegend | null` (default `null`, import the type) and pass `:density="density"` to `MapLegend`.

`QuakeMap.vue`: imports `MapDensity`, `densityLegendFor`, `fmtFloor`, `fmtInt`; script adds

```ts
const showDensity = ref(true);
/** The window's density grid, present only when the floor was raised. */
const density = computed(() => {
  const s = catalog.stats.value;
  return catalog.raised.value && s !== null ? s.grid : null;
});
const densityLegend = computed(() =>
  density.value === null || !showDensity.value
    ? null
    : densityLegendFor(density.value, catalog.requested.value),
);
```

`countLine` becomes

```ts
const countLine = computed(() => {
  const base = `Showing ${String(events.value.length)} of ${fmtInt(catalog.windowTotal.value)} events`;
  return catalog.raised.value ? `${base} · markers at ${fmtFloor(catalog.floor.value)}` : base;
});
```

Template: `<MapShell ... :density="densityLegend">`; in `tools`, before the focal-mechanism label:

```vue
<label v-if="density !== null"><input v-model="showDensity" type="checkbox" /> Density</label>
```

in `layers`, before `<MapEvents`:

```vue
<MapDensity v-if="density !== null && showDensity" :path="mv.view.value.path" :grid="density" />
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @tectonic/web test -- test/lib/density.test.ts test/components/MapDensity.test.ts test/components/MapLegend.test.ts test/components/QuakeMap.test.ts test/components/VolcanoMap.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/density.ts apps/web/src/components/MapDensity.vue apps/web/src/components/MapLegend.vue apps/web/src/components/MapShell.vue apps/web/src/components/QuakeMap.vue apps/web/test/lib/density.test.ts apps/web/test/components/MapDensity.test.ts apps/web/test/components/MapLegend.test.ts apps/web/test/components/QuakeMap.test.ts
git commit -m "feat(web): density grid under the markers when the floor was raised"
```

---

### Task 7: Animation steps by day, month or year

**Files:**

- Modify: `apps/web/src/lib/animation.ts`, `apps/web/src/components/QuakeMap.vue`
- Test: `apps/web/test/lib/animation.test.ts`, `apps/web/test/components/QuakeMap.test.ts`

**Interfaces:**

- Produces: `StepUnit = "day" | "month" | "year"`, `UNIT_MS`, `unitFor(start, end)`; `Animation.unit: Ref<StepUnit>`, `secondsPerUnit` (was `secondsPerDay`), `step(delta)` (was `stepDay`).

- [ ] **Step 1: Tests**

In `animation.test.ts` rename `secondsPerDay` → `secondsPerUnit` and `stepDay` → `step` throughout, import `unitFor`, and add:

```ts
it("picks the step unit from the window length", () => {
  const d = (days: number) => new Date(days * 864e5);
  expect(unitFor(d(0), d(120))).toBe("day");
  expect(unitFor(d(0), d(121))).toBe("month");
  expect(unitFor(d(0), d(15 * 365.25))).toBe("month");
  expect(unitFor(d(0), d(15 * 365.25 + 1))).toBe("year");
});
it("advances and steps by the unit over a long window", () => {
  const a = createAnimation(100);
  a.open(new Date("1900-01-01T00:00:00Z"), new Date("2026-10-13T12:00:00Z"), "utc");
  expect(a.unit.value).toBe("year");
  a.secondsPerUnit.value = 1;
  a.play();
  vi.advanceTimersByTime(1000);
  expect(a.cursor.value?.toISOString()).toBe("1900-12-31T00:00:00.000Z");
  a.step(1);
  expect(a.cursor.value?.toISOString()).toBe("1901-12-31T00:00:00.000Z");
  a.close();
  a.open(new Date("2024-01-01T00:00:00Z"), new Date("2026-10-13T12:00:00Z"), "utc");
  expect(a.unit.value).toBe("month");
  a.step(1);
  expect(a.cursor.value?.toISOString()).toBe("2024-01-30T00:00:00.000Z");
  a.close();
});
```

In `QuakeMap.test.ts`, the day-by-day test keeps `Back one day`/`Forward one day` and additionally asserts the label: after opening the animation add `expect(w.find(".animbar label").text()).toContain("Seconds per day");`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @tectonic/web test -- test/lib/animation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`animation.ts`:

```ts
import { ref, type Ref } from "vue";
import { dayStart } from "./filters.js";
import { dateIn, type Zone } from "./format.js";

export const DAY_MS = 864e5;

export type StepUnit = "day" | "month" | "year";
export const UNIT_MS: Record<StepUnit, number> = {
  day: DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
};

/** Day steps up to 120 days, month steps up to 15 years, year steps beyond. */
export function unitFor(start: Date, end: Date): StepUnit {
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  return days <= 120 ? "day" : days <= 15 * 365.25 ? "month" : "year";
}

/**
 * A tracking clock over the loaded window. The map shows only events whose
 * origin time is at or before `cursor` while the animation is open.
 */
export interface Animation {
  active: Ref<boolean>;
  playing: Ref<boolean>;
  /** What one step is: a day, a 30-day month or a 365-day year, from the window length. */
  unit: Ref<StepUnit>;
  /** Playback speed: real seconds per animated unit. */
  secondsPerUnit: Ref<number>;
  cursor: Ref<Date | null>;
  start: Ref<Date | null>;
  end: Ref<Date | null>;
  /** Opens at 00:00 of the day before the window's first day, in the zone, paused. */
  open(windowStart: Date, windowEnd: Date, zone: Zone): void;
  play(): void;
  pause(): void;
  /** Moves the cursor as `ms` of real time would at the current speed; no-op while closed. */
  advance(ms: number): void;
  /** Moves the cursor a whole unit, clamped to the window, and pauses. */
  step(delta: 1 | -1): void;
  close(): void;
}
```

In `createAnimation`: `const unit = ref<StepUnit>("day"); const secondsPerUnit = ref(2);`; in `advance`, `const next = b.c.getTime() + (ms / 1000 / speed) * UNIT_MS[unit.value];`; in `open`, before `pause()` returns control, `unit.value = unitFor(windowStart, windowEnd);`; `step(delta)` uses `delta * UNIT_MS[unit.value]`; return `unit` and `secondsPerUnit` in place of `secondsPerDay`, `step` in place of `stepDay`.

`QuakeMap.vue` bar:

```vue
<label>Seconds per {{ anim.unit.value }}
          <input v-model.number="anim.secondsPerUnit.value" type="number" min="0.1" step="0.5" />
        </label>
<button
  type="button"
  class="zbtn"
  :aria-label="`Back one ${anim.unit.value}`"
  @click="anim.step(-1)"
>
          ◀
        </button>
<!-- play button unchanged -->
<button
  type="button"
  class="zbtn"
  :aria-label="`Forward one ${anim.unit.value}`"
  @click="anim.step(1)"
>
          ▶
        </button>
```

and the toolbar button's title becomes `Replay the loaded window on the map, step by step`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @tectonic/web test -- test/lib/animation.test.ts test/components/QuakeMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/animation.ts apps/web/src/components/QuakeMap.vue apps/web/test/lib/animation.test.ts apps/web/test/components/QuakeMap.test.ts
git commit -m "feat(web): animation steps by day, month or year with the window length"
```

---

### Task 8: Docs, full verification

**Files:**

- Modify: `README.md`, `CLAUDE.md`, `apps/web/src/components/App.vue` (footer), the spec (three wording fixes)

- [ ] **Step 1: README Front end section**

Replace the date-range bullet's last sentence about 90 days and add two bullets:

```markdown
- A date range (from, to; inclusive calendar days) loads that window from the server for the map,
  catalog and charts. The inputs always show the window in force: "from" defaults to thirty days
  before today and "to" to today, and the magnitude minimum shows the view's floor; Reset returns
  to those defaults; only explicit bounds go in the URL (`since`, `until`). Dates reach back to
  1900-01-01, and a "Span…" select sets the start 30 or 90 days, 1, 10 or 50 years before the end,
  or at 1900. The header's "Times" button switches every date and time on the page, and the way
  the date filter is read, between UTC (default) and the browser's zone; it is kept in the URL as
  `tz=local`.
- Long windows stay within a 2,000-event budget. The page first asks `GET /api/events/summary` for
  the window at the floor in force; if the total fits, every event is loaded, otherwise the marker
  floor is raised to M5, M6 or M7 (the lowest band that fits) and the page says so under the Refine
  bar and in the map's count line. In that overview mode the map shades `GET /api/events/grid`
  cells (2° globally, 0.5° on the West Coast) under the markers, the time chart shows events per
  day, month or year with the largest magnitude in each, and the table and magnitude charts use the
  raised floor (the b-value's Mc follows it).
- The time chart marks the breaks in the record whenever they fall inside the window: 1964 (WWSSN,
  ISC), 1973 (NEIC PDE enters ComCat) and 1976 (Global CMT). A step in the counts at those lines is
  detection, not seismicity.
```

Update the Animate bullet: "set seconds per step (a day, a 30-day month or a 365-day year, chosen from the window length), start, pause, step either way, close."

- [ ] **Step 2: CLAUDE.md Front end bullet**

Add after the Pages bullet:

```markdown
- Long windows: `createCatalog` loads a range by calling `summary` first, `chooseFloor` picks the list floor from the bands (requested, else 5/6/7 within `EVENT_LIMIT`), then `events` at that floor and `grid` at the requested floor when raised; the result is `catalog.stats` (`WindowStats`), with `requested`, `floor` (effective), `raised` and `windowTotal`. `MapDensity.vue` shades `cellRing` polygons (clockwise, `src/lib/density.ts`) with no pointer events; `MagnitudeTimeChart` switches to per-bin bars and maxima when `raised`; `src/lib/eras.ts` holds the 1964/1973/1976 marks; `animation.ts` steps by `unitFor(start, end)`.
```

- [ ] **Step 3: Footer sentence in `App.vue`**

In the "Data" paragraph, after "Tensors can lag an origin by hours." add:

```
The catalogue reaches back to 1900; before 1973 ComCat carries the ISC-GEM and Centennial compilations, so completeness varies by era, and the time chart marks the breaks at 1964, 1973 and 1976.
```

- [ ] **Step 4: Spec wording fixes**

In the spec: §4 "counter-clockwise" → "clockwise, as d3-geo requires for a ring smaller than a hemisphere"; §3 `presetRangeFor` sentence → "`eventsQueryFor` becomes `filterQueryFor(region, now, range, minMag)`; the preset load passes `null` and `region.minMag`"; §5 "x: `[since, min(until, now)]` as today (the window, not the first event)" → "x: the window `[since, min(until, now)]` in both modes (the per-event mode used to start at the first event)". Add `src/lib/density.ts` to §4's file list.

- [ ] **Step 5: Full verification**

Run from the repo root:

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm --filter @tectonic/web test:coverage
pnpm build
```

Expected: all clean; coverage 100% on statements, branches, functions and lines for `apps/web/src`. Fix anything Prettier rewrites with `pnpm exec prettier --write <files>`.

- [ ] **Step 6: Commit and push**

```bash
git add README.md CLAUDE.md apps/web/src/components/App.vue docs/superpowers/specs/2026-10-17-earthquake-history-ui-design.md
git commit -m "docs: long-range windows, overview mode and era marks"
git push -u origin earthquake-history-ui
```

Then check the live page in Chrome against the deployed backfill: open `/?since=1900-01-01`, confirm the note, the density grid, the overview chart with three era lines, the legend row and the year-stepping animation.
