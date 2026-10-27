# Space Weather Long History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decades of Kp, Dst, sunspot number and F10.7 on the Space page, backfilled from GFZ and WDC Kyoto and refreshed daily, with GFZ's Kp set against SWPC's at every span and the solar cycles marked.

**Architecture:** Four new series ids flow through the existing tall samples table (no migration); a history client reads GFZ's JSON service and Kyoto's HAPI CSV; a daily job and a CLI write them through `upsertSamples`. The window route lifts its cap to 100 years, aggregates per series (max, min or mean) and stops reading events past 93 days. The web adds long windows, a long row set on the stack, a GFZ step over the Kp bars and cycle marks.

**Tech Stack:** TypeScript, Fastify, Drizzle, Postgres, zod, Vue 3, d3-scale, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-26-space-history-design.md`.
- 100 % coverage on `apps/server/src`, `packages/shared/src`, `apps/web/src`; no `as` to silence nullability, no `!`; imports of local files end in `.js`.
- Gate before every push: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build`.
- Branch `space-history`; one commit per task; messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `Record<SpaceSeries, …>` maps (shared `seriesRecord`, web `CADENCE_MS`, `SHORT`, test fixtures) must name every series, so Task 1 updates all of them.

---

### Task 1: The four series and the aggregate table

**Files:**

- Modify: `packages/shared/src/space.ts` (`SPACE_SERIES`, `seriesRecord`, new `SERIES_AGGREGATE`)
- Modify: `packages/shared/src/api.ts` (`ApiSpaceWindow.preliminaryKpFrom`)
- Modify: `apps/web/src/lib/space-chart.ts` (`CADENCE_MS`), `apps/web/src/components/SpaceStack.vue` (`SHORT`)
- Modify: `apps/web/test/support/space.ts` (`spaceNow().latest`, `spaceWindow().samples`, `preliminaryKpFrom: null`), `apps/web/test/lib/space-chart.test.ts` (`CADENCE_MS` length 17)
- Test: `packages/shared/test/space.test.ts`

**Interfaces (produces):**

```ts
// packages/shared/src/space.ts
export const SPACE_SERIES = [..., "hp_south", "kp_gfz", "ap", "ssn", "f107"] as const;
export type SeriesAggregate = "max" | "min" | "mean";
/** How a wide bucket summarises a series: the storm survives (max or min), the rest average. */
export const SERIES_AGGREGATE: Record<SpaceSeries, SeriesAggregate> = seriesRecord((s) => ...);
// packages/shared/src/api.ts
export interface ApiSpaceWindow { ...; /** ISO time of the earliest preliminary GFZ Kp row, or null. */ preliminaryKpFrom: string | null; }
```

- [ ] **Step 1:** Add the test to `packages/shared/test/space.test.ts`:

```ts
it("names the aggregate of every series", () => {
  expect(SPACE_SERIES).toHaveLength(17);
  expect(SERIES_AGGREGATE.kp_gfz).toBe("max");
  expect(SERIES_AGGREGATE.dst).toBe("min");
  expect(SERIES_AGGREGATE.bz_gsm).toBe("min");
  expect(SERIES_AGGREGATE.f107).toBe("mean");
  expect(SERIES_AGGREGATE.xray_long).toBe("max");
  expect(Object.keys(SERIES_AGGREGATE)).toHaveLength(17);
});
```

- [ ] **Step 2:** Run `pnpm --filter @tectonic/shared test`; expect failure on the missing export.
- [ ] **Step 3:** Add the ids with doc comments (`kp_gfz`: GFZ Potsdam planetary Kp, 3-hourly, definitive or preliminary; `ap`: GFZ daily Ap; `ssn`: daily sunspot number as GFZ carries it; `f107`: observed 10.7 cm flux, sfu), extend `seriesRecord`, add `SERIES_AGGREGATE` (`max`: kp_1m, kp_3h, kp_gfz, ap, xray_long, xray_short, p10, p100, hp_north, hp_south; `min`: dst, bz_gsm; `mean`: bt, speed, density, ssn, f107), add the API field.
- [ ] **Step 4:** `pnpm shared:build && pnpm typecheck` and fix every `Record<SpaceSeries>` the compiler names: web `CADENCE_MS` (kp_gfz 3 h, ap/ssn/f107 86 400 000), `SHORT` (`kp_gfz: "GFZ"`, `ap: "Ap"`, `ssn: "SSN"`, `f107: "F10.7"`), test support `spaceNow().latest` (kp_gfz `reading(4.33, "gfz", "2026-10-13T09:00:00.000Z")`, ap `reading(18, "gfz", "2026-10-12T00:00:00.000Z")`, ssn `reading(120, "gfz", ...)`, f107 `reading(165.2, "gfz", ...)`), `spaceWindow().samples` (kp_gfz `pointsEnding(3 * H, [2, 2.33, 3.33, 3.67, 4.33, 5.33, 4.67, 4.33])`, ap/ssn/f107 `[]`), `preliminaryKpFrom: null`, and the `CADENCE_MS` length assertion (17).
- [ ] **Step 5:** `pnpm test`; commit `feat(shared): four history series and the per-series aggregate`.

### Task 2: History client and parsers

**Files:**

- Create: `apps/server/src/space/history-schema.ts`, `apps/server/src/space/history-client.ts`, `apps/server/src/space/history-parse.ts`
- Create fixtures: `apps/server/test/fixtures/gfz/Kp.json` (two days around the def/pre boundary, 16 values, one null), `Ap.json`, `SN.json`, `Fobs.json` (three days each), `apps/server/test/fixtures/kyoto/hour_dst_info.json` (the real `info` body), `apps/server/test/fixtures/kyoto/hour_dst.csv` (six lines incl. a `99999` and versions 20, 10, 0)
- Create: `apps/server/test/support/history-stub.ts`
- Test: `apps/server/test/space/history-client.test.ts`, `apps/server/test/space/history-parse.test.ts`
- Modify: `apps/server/src/ingest/retry.ts` (`retryable` reads `status` off any Error), `apps/server/test/ingest/retry.test.ts`

**Interfaces (produces):**

```ts
// history-schema.ts
export const GFZ_INDEXES = ["Kp", "Ap", "SN", "Fobs"] as const;
export type GfzIndex = (typeof GFZ_INDEXES)[number];
export const gfzSchema: z.ZodType<GfzDoc>; // { datetime: string[]; meta?: unknown } & { [index]: (number|null)[]; [`${index}status`]?: string[] } — modelled as looseObject with datetime: string[] and read by key
export interface GfzDoc {
  datetime: string[];
  values: (number | null)[];
  status: string[] | null;
}
export const hapiInfoSchema = z.looseObject({ startDate: z.string(), stopDate: z.string() });
export type HapiInfo = z.infer<typeof hapiInfoSchema>;
// history-client.ts
export const GFZ_BASE = "https://kp.gfz.de/app/json/";
export const KYOTO_BASE = "https://wdc.kugi.kyoto-u.ac.jp/hapi";
export interface HistoryClient {
  fetchGfz: (index: GfzIndex, from: Date, to: Date) => Promise<GfzDoc>;
  fetchDstInfo: () => Promise<HapiInfo>;
  /** Hourly Dst CSV between the instants, already clipped to the dataset's range; "" when the range misses it. */
  fetchDst: (from: Date, to: Date) => Promise<string>;
}
export function createHistoryClient(opts: {
  fetch?: typeof fetch;
  userAgent: string;
  timeoutMs?: number;
  gfzBase?: string;
  kyotoBase?: string;
}): HistoryClient;
// history-parse.ts
export const GFZ_SERIES: Record<GfzIndex, SpaceSeries> = {
  Kp: "kp_gfz",
  Ap: "ap",
  SN: "ssn",
  Fobs: "f107",
};
export function parseGfz(index: GfzIndex, doc: GfzDoc): SpaceSample[]; // source "gfz" | "gfz-pre" (Kp only, from status), nulls skipped
export function parseKyotoDst(csv: string): SpaceSample[]; // time floored to the hour, 99999 skipped, source "kyoto"
```

- [ ] **Step 1:** Write the fixtures from the live responses (`curl` the GFZ URLs for 2026-09-29..2026-10-01 and trim; the Kyoto info body; six CSV lines).
- [ ] **Step 2:** Write `history-parse.test.ts`: Kp doc → 15 samples (null skipped), sources `gfz` before the boundary and `gfz-pre` after, series `kp_gfz`; Ap/SN/Fobs → series and source `gfz`; CSV → times `…T00:00:00Z` from `…T00:29:30Z`, the fill line skipped, values integers, source `kyoto`; a malformed CSV line (two columns) skipped.
- [ ] **Step 3:** Write `history-client.test.ts` with an injected fetch: `fetchGfz("Kp", from, to)` builds `GFZ_BASE?start=<iso>&end=<iso>&index=Kp` with the user agent header and parses; a 503 throws `SpaceHttpError`; `fetchDstInfo` reads `KYOTO_BASE/info?id=hour_dst`; `fetchDst` first reads info then requests `data?id=hour_dst&parameters=dstValue,versionCode&time.min=<max(from,startDate)>&time.max=<min(to,stopDate)>` and returns the text; when `from > stopDate` or `to < startDate` it returns "" without a data request; the default global fetch path.
- [ ] **Step 4:** Run; fail on missing modules. Implement the three modules (the client reuses `SpaceHttpError` from `./client.js` and the same timeout pattern).
- [ ] **Step 5:** `retry.ts`: replace the `UsgsHttpError` check with `const status = statusOf(err)` where `statusOf` returns `err.status` when `err instanceof Error` and `typeof (err as {status?: unknown}).status === "number"` — written without `as`: `"status" in err && typeof err.status === "number"`. Test with a `SpaceHttpError(404)` (not retryable) and `SpaceHttpError(502)` (retryable).
- [ ] **Step 6:** `history-stub.ts`: `stubHistory(opts?)` answering from the fixtures, recording `calls: string[]`, per-method override or Error, like `stubSpace`.
- [ ] **Step 7:** Green, lint, commit `feat(server): GFZ and Kyoto history client and parsers`.

### Task 3: Repository aggregate, preliminary marker, route cap

**Files:**

- Modify: `apps/server/src/repositories/space.ts` (`samplesBetween` aggregate per series, new `preliminaryKpFrom`, `deleteSupersededKp`)
- Modify: `apps/server/src/api/schemas.ts` (`SPACE_WINDOW_MAX_MS` = 100 years as `36_525 * DAY_MS`, new `SPACE_DETAIL_MAX_MS` = 93 days, `parseSpaceWindow` returns `detail: boolean`)
- Modify: `apps/server/src/routes/space.ts` (skip flares/alerts/scales when `!detail`; `preliminaryKpFrom` in the response)
- Test: `apps/server/test/repositories/space.test.ts`, `apps/server/test/routes/space.test.ts`

**Interfaces (produces):**

```ts
export async function preliminaryKpFrom(db: Db): Promise<Date | null>;
/** Removes gfz-pre rows whose time now has a definitive gfz row; returns the count. */
export async function deleteSupersededKp(db: Db): Promise<number>;
export interface SpaceWindowQuery {
  from: Date;
  to: Date;
  bucketSeconds: number | null;
  detail: boolean;
}
```

- [ ] **Step 1:** Repository tests: seed `kp_gfz` 3-hourly values [2, 7, 3] inside one 12-hour bucket and `dst` [-10, -80, -20] and `bt` [4, 6] → `samplesBetween(..., 43_200)` gives kp_gfz 7, dst -80, bt 5. Seed `gfz-pre` rows at t1, t2 and a `gfz` row at t1: `preliminaryKpFrom` → t1; `deleteSupersededKp` → 1, then `preliminaryKpFrom` → t2; with no pre rows → null.
- [ ] **Step 2:** Route tests: a 200-day window returns 200 with empty `flares`, `alerts`, `scales`, a bucket, and `preliminaryKpFrom` as the ISO of the seeded pre row; a 101-year window is a 400 "window must not exceed 100 years"; a 7-day window still carries flares and `preliminaryKpFrom: null` when there are no pre rows. Update the `bucketFor` expectations if they change (they do not).
- [ ] **Step 3:** Implement. The aggregate SQL: build `case series when 'kp_1m' then max(value) …` is awkward; instead run the bucket query three times, once per aggregate with `series in (...)` lists from `SERIES_AGGREGATE`, and merge. One helper `bucketQuery(agg: SeriesAggregate, ids: SpaceSeries[])`.
- [ ] **Step 4:** Green, commit `feat(server): per-series bucket aggregate, preliminary Kp marker, 100-year windows`.

### Task 4: Daily history job, backfill, CLI, config

**Files:**

- Create: `apps/server/src/ingest/space-history.ts`, `apps/server/src/space-history-cli.ts`
- Modify: `apps/server/src/ingest/space.ts` (`SpaceContext.history`, export `runParts`), `apps/server/src/config.ts` (`SPACE_HISTORY_INTERVAL_MS`, min 3 600 000, default 86 400 000), `apps/server/src/index.ts` (create the history client; `space_history` job), `apps/server/package.json` (`"space:history": "node --env-file-if-exists=../../.env --import tsx src/space-history-cli.ts"`), `apps/server/vitest.config.ts` (exclude the CLI)
- Modify tests that build a `SpaceContext`: `test/repositories/space.test.ts`, `test/routes/space.test.ts` (add `history: stubHistory()`), `test/config.test.ts`
- Test: `apps/server/test/ingest/space-history.test.ts` (Docker suite)

**Interfaces (produces):**

```ts
export const HISTORY_REFRESH_DAYS = 60;
export const HISTORY_CHUNK_YEARS = 10;
export const HISTORY_START = new Date("1932-01-01T00:00:00Z");
export function syncSpaceHistory(ctx: SpaceContext): Promise<SpaceRunResult>; // parts gfz_Kp, gfz_Ap, gfz_SN, gfz_Fobs, dst over [now - 60 d, now]
export interface HistoryBackfillOptions {
  from: Date;
  to: Date;
  sleep?: (ms: number) => Promise<void>;
}
export interface HistoryBackfillResult {
  written: Record<SpaceSeries, number>;
  superseded: number;
}
export function backfillSpaceHistory(
  ctx: SpaceContext,
  opts: HistoryBackfillOptions,
): Promise<HistoryBackfillResult>; // chunks newest first, withRetry per request, logs each chunk
export function historyChunks(from: Date, to: Date): { from: Date; to: Date }[]; // ten-year pieces, newest first, last one clipped to `from`
```

- [ ] **Step 1:** Tests: `historyChunks(1932, 2026-10-26)` gives ten pieces newest first with boundaries at UTC 1 Jan; the job writes the fixture rows (count per part), deletes superseded pre rows, and a failing Dst leaves the GFZ parts written; the backfill over a two-chunk range calls `fetchGfz` once per index per chunk and `fetchDst` once per chunk and returns per-series counts; a retried 503 (stub throws `SpaceHttpError(503)` once) succeeds with one `warn`.
- [ ] **Step 2:** Implement; the CLI mirrors `ingest-cli.ts` (`--from`, `--to` parsed with `Date.parse`, pino logger, closes the pool).
- [ ] **Step 3:** README ingest paragraph: the history job and the CLI. Green, commit `feat(server): daily history refresh and the space:history backfill`.

### Task 5: Long windows in the web store and refine bar

**Files:**

- Modify: `apps/web/src/lib/space.ts` (`WINDOWS` + `1y`, `11y`, `all`; `HISTORY_START`; `MAX_RANGE_MS` = 100 years; `isLongRange`; `LONG_INTERVAL_MS` = 600 000; the timer uses it while long)
- Modify: `apps/web/src/components/SpaceRefine.vue` (caption via `aggregateNote(bucketSeconds)` from `space-chart.ts`: "Points are 23-day maxima (Kp, fluxes), minima (Dst, Bz) and means over this window." with the unit chosen: minutes under 2 h, hours under 2 days, else days)
- Test: `apps/web/test/lib/space.test.ts`, `apps/web/test/components/SpaceRefine.test.ts`

**Interfaces (produces):**

```ts
export const WINDOWS = [..., { id: "1y", label: "1 year", ms: 365.25 * DAY }, { id: "11y", label: "11 years", ms: 11 * 365.25 * DAY }, { id: "all", label: "Since 1932", ms: null }] as const;
export const HISTORY_START = new Date("1932-01-01T00:00:00Z");
export const LONG_RANGE_MS = 93 * DAY; export const MAX_RANGE_MS = 36_525 * DAY;
export const isLongRange = (from: Date, to: Date): boolean => to.getTime() - from.getTime() > LONG_RANGE_MS;
export function windowMs(id: WindowId, now: Date): number; // "all" → now - HISTORY_START
export function aggregateNote(bucketSeconds: number | null): string; // "" for raw
```

- [ ] **Step 1:** Tests: `rangeBounds({kind:"window", id:"all"}, NOW)` starts 1932-01-01; a 5-year fixed range parses; `isLongRange`; the store with a `1y` range ticks every 600 000 ms (fake timers: no second call at 60 s, one at 600 s); `aggregateNote(null)` is "", `aggregateNote(420)` "Points are 7-minute maxima (Kp, fluxes), minima (Dst, Bz) and means over this window.", `aggregateNote(2_000_160)` "… 23-day …".
- [ ] **Step 2:** Implement; the refine options test gains "1 year", "11 years", "Since 1932".
- [ ] **Step 3:** Green, commit `feat(web): long windows, slower polling and the aggregate note`.

### Task 6: Long rows, the GFZ step, cycle marks

**Files:**

- Create: `apps/web/src/lib/cycles.ts`
- Modify: `apps/web/src/lib/space-chart.ts` (`RowSpec.long`, `sun` row, `LONG_ROWS`/`rowsFor(long)`, `kpBars(..., widthMs)`, `stepPath`, `splitAt(points, ms)`), `apps/web/src/components/SpaceStack.vue`, `apps/web/src/styles.css` (`.sline.kp_gfz`, `.sline.kp_gfz.pre` dashed, `.cyclemark` like `.eramark`, `.sline.ssn`, `.sline.f107`)
- Test: `apps/web/test/lib/space-chart.test.ts`, `apps/web/test/lib/cycles.test.ts`, `apps/web/test/components/SpaceStack.test.ts`

**Interfaces (produces):**

```ts
export type RowId = ... | "sun";
export interface RowSpec { ...; long: boolean }
export const rowsFor = (long: boolean): RowSpec[] => ROWS.filter((r) => (long ? r.long : r.id !== "sun"));
export function kpBars(points, x, y, bottom, widthMs: number): KpBar[];
export function stepPath(points: Points, x, y, gap: number, widthMs: number): string; // M x0,y H x1 per point, joined while within gap
export function splitAt(points: Points, ms: number | null): { before: Points; after: Points };
export interface RowLine { series: SpaceSeries; d: string; cls?: string }
// cycles.ts
export interface SolarCycle { number: number; minimum: Date; maximum: Date | null }
export const CYCLES: readonly SolarCycle[]; // 17..25 from SILSO
export function cycleMarks(from: Date, to: Date, x: (d: Date) => number): EraMark[]; // era: { year, label: `Cycle ${n}`, note }
export const CYCLE_MARK_MIN_MS = 2 * 365.25 * 86_400_000;
```

- [ ] **Step 1:** Chart tests: `rowsFor(false)` is the seven ids, `rowsFor(true)` is `["kp","dst","sun"]`; `kpBars` with width 6 h doubles the bar; `stepPath` of two 3-hourly points is `M0.0,70.0H1.0M1.0,40.0H2.0` when adjacent (joined with L when the gap is within); `splitAt` by ms; cycles: `cycleMarks(1990, 2026)` gives 23, 24, 25 with the note "Minimum Aug 1996, maximum Nov 2001" and "Minimum Dec 2019" for 25.
- [ ] **Step 2:** Stack tests: with the default 24 h window the Kp row has `.sline.kp_gfz` (solid) and, with `preliminaryKpFrom` set to the fifth point, a `.sline.kp_gfz.pre`; the readout for Kp reads `Kp 3.67 · 3-h 4 · GFZ 4+ · Δ +⅓`; with a 400-day window (`spaceWindow({from, to, bucketSeconds, samples: {... kp_gfz, dst, ssn, f107 points}})`) the rows are kp, dst, sun, the Kp bars come from `kp_gfz`, no alert ticks, three `.cyclemark` lines with labels when the span is over two years (use a 3-year window), the sun row label "Sunspots · F10.7 · sfu".
- [ ] **Step 3:** Implement. In `buildRow`, `long` and `preliminaryKpFrom` are passed in; the Kp row's bars use `kp_3h` (short) or `kp_gfz` (long) with width `Math.max(CADENCE_MS.kp_3h, bucket * 1000)`; lines skip `kp_3h` and `kp_gfz` (short mode draws kp_gfz as two step paths, pushed as `RowLine`s with `cls: "pre"` for the preliminary part); long mode draws no Kp lines. Readout: when the row is `kp` and both `kp_3h` and `kp_gfz` points are within gap, append `Δ ${sign}${thirds}` with ⅓/⅔ glyphs via `fmtThirds(diff)` in `space-format.ts` (`+⅓`, `-1⅔`, `0`). `H` becomes a computed from the row count. Cycle marks render as dashed lines with tiered labels along the top, `erasSentence`-style text in the caption.
- [ ] **Step 4:** Green, commit `feat(web): long row set, GFZ Kp step and solar cycle marks`.

### Task 7: Page note, credits, docs

**Files:**

- Modify: `apps/web/src/components/SpacePage.vue` (hide `SpaceAlerts`, `SpaceFlares` and show `<p class="note longnote">Flares, alerts and the minute-scale rows need a window of 93 days or less.</p>` when `isLongRange` of the store's window), `apps/web/src/components/App.vue` (footer paragraph), `README.md` (credits table rows for GFZ and Kyoto, page paragraph: windows), `CLAUDE.md` (space weather paragraph: history series, job, CLI, long mode)
- Test: `apps/web/test/components/SpacePage.test.ts`

- [ ] **Step 1:** Page test with a long window: no `.alerts` cards, no flares list, the note present; the default window shows no note.
- [ ] **Step 2:** Credits: footer sentence "The definitive Kp, ap and Ap, the daily sunspot number and the 10.7 cm flux since 1932 come from GFZ Potsdam (CC BY 4.0; Matzka et al. 2021, doi:10.5880/Kp.0001); hourly Dst since 1957 is read from the WDC Kyoto directly (doi:10.17593/14515-74000, non-commercial use; the newest hours are real-time quicklook values)." README rows to match.
- [ ] **Step 3:** Full gate, commit `docs: credits and notes for the space history`.

### Task 8: Load and check

- [ ] **Step 1:** `pnpm --filter @tectonic/server space:history` against the dev DB (port 5433); expect about 277k + 600k + 3×34k rows in a few minutes.
- [ ] **Step 2:** `pnpm dev`; in Chrome open `/space?window=11y`, `/space?window=all`, `/space` (GFZ step over the bars, readout with Δ), check the caption, cycle labels and the note; fix what looks wrong; commit.
- [ ] **Step 3:** Push and hand the PR to the user.
