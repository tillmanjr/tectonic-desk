# Space Weather: Long History

**Date:** 2026-10-26. **Status:** approved in outline (four decisions below), spec under review.
Space weather sub-project 3 of 4 (see `2026-10-25-space-weather-design.md`).

## Goal

The Space page can show decades: the definitive planetary Kp since 1932, hourly Dst since 1957,
daily sunspot number and F10.7 since 1932 and 1947, with the solar cycles marked on the axis,
and SWPC's Kp estimate set against GFZ's definitive value at every span.

## Decisions (2026-10-26)

| Topic        | Decision                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation | Long windows on the Space page itself: the window select gains 1 year, 11 years and Since 1932; from/to accepts any span up to 100 years. Past 93 days the stack switches to its long rows. |
| Kp compare   | GFZ Kp is a second trace on the Kp row at every span, dashed where still preliminary; the pointer readout shows SWPC and GFZ side by side with their difference.                            |
| Backfill     | Full archives by a one-off CLI: Kp, Ap, sunspots from 1932, F10.7 from 1947, Dst from 1957 (about 1.1 M rows). A daily job refreshes the last 60 days.                                      |
| Cycle marks  | Solar cycles 17 to 25 marked at their minima along the top of the stack when the window exceeds two years, placed with the earthquake chart's `eraLabels`.                                  |

## Sources (verified 2026-10-26)

**GFZ Potsdam Kp index service**, `https://kp.gfz.de/app/json/?start=<iso>&end=<iso>&index=<id>`,
CC BY 4.0, cite Matzka et al. (2021), doi:10.5880/Kp.0001. Response
`{ datetime: string[], <id>: (number|null)[], <id>status?: ("def"|"pre")[], meta }`. One request
covers the whole archive: `Kp` (3-hourly since 1932-01-01, 277,064 values, 9.5 MB, the last
~26 days `pre`), `Ap` (daily since 1932, `Apstatus`), `SN` (daily sunspot number since 1932,
`SNstatus`), `Fobs` (daily observed F10.7 since 1947-01-01, sfu, no status). Definitive values
replace preliminary ones about a month after the fact.

**WDC for Geomagnetism, Kyoto, HAPI server**, `https://wdc.kugi.kyoto-u.ac.jp/hapi`, dataset
`hour_dst` ("Best Available": final, then provisional, then real-time), doi:10.17593/14515-74000,
non-commercial use, acknowledge WDC Kyoto. `info?id=hour_dst` gives `startDate`
(1957-01-01T00:29:30Z) and `stopDate` (about an hour ahead of now); a `data` request outside them
is a 400, so requests are clipped to that range. `data?id=hour_dst&parameters=dstValue,versionCode
&time.min=&time.max=` returns header-less CSV `time,dst,version`: times are bin centres
(`hh:29:30`), `99999` is the fill, version `20` final, `10` provisional, `0` real-time. Ten years
(87,648 lines, 2.5 MB) come back in about two seconds.

**SILSO** cycle table (`https://www.sidc.be/SILSO/cyclesmm`) for the minima: 17 1933-09, 18
1944-02, 19 1954-04, 20 1964-10, 21 1976-03, 22 1986-09, 23 1996-08, 24 2008-12, 25 2019-12;
maxima 1937-04, 1947-05, 1958-03, 1968-11, 1979-12, 1989-11, 2001-11, 2014-04 (25 not yet
listed). Static data in the web package, no fetch.

## Storage

Four new ids in `SPACE_SERIES` (no migration): `kp_gfz` (3-hourly), `ap` (daily), `ssn`
(daily), `f107` (daily, observed). Dst from Kyoto lands in the existing `dst` series with source
`kyoto`, its bin-centre time floored to the hour, so a provisional or final value replaces the
real-time one SWPC relayed under the same key. Every history time sits on the 5-minute grid,
which keeps `downsampleBefore` from touching these rows.

Preliminary GFZ Kp rows carry source `gfz-pre`, definitive ones `gfz`. After each GFZ upsert the
job deletes `gfz-pre` rows whose time now has a `gfz` row. `ap` and `ssn` are stored under `gfz`
regardless of status (daily values, no trace to dash).

## Server

- `src/space/history-client.ts`: `createHistoryClient({ fetch?, userAgent, timeoutMs?, gfzBase?,
kyotoBase? })` with `fetchGfz(index: "Kp" | "Ap" | "SN" | "Fobs", from, to)`, `fetchDstInfo()`
  and `fetchDst(from, to)`; zod shapes in `src/space/history-schema.ts`; HTTP failures throw
  `SpaceHttpError`.
- `src/space/history-parse.ts`: `parseGfz(index, doc): SpaceSample[]` (null values skipped; Kp
  rows take the source from the status) and `parseKyotoDst(csv): SpaceSample[]` (fill skipped,
  time floored to the hour, source `kyoto`).
- `ingest/retry.ts`: `retryable` reads a numeric `status` off any `Error` (USGS or space client)
  instead of being bound to `UsgsHttpError`.
- `ingest/space-history.ts`: `syncSpaceHistory(ctx)` (the daily job, `space_history`, through
  `runParts`: four GFZ indexes and Dst for the last `HISTORY_REFRESH_DAYS` = 60) and
  `backfillSpaceHistory(ctx, { from, to })` (ten-year chunks newest first, each request through
  `withRetry`, progress logged per chunk, returns rows written per series). Both call
  `deleteSupersededKp` after a Kp upsert. `SpaceContext` gains `history: HistoryClient`.
- `space-history-cli.ts` (coverage-excluded): `pnpm --filter @tectonic/server space:history
[--from DATE] [--to DATE]`, defaults 1932-01-01 to now. Config `SPACE_HISTORY_INTERVAL_MS`
  (default 24 h, min 1 h); the job is in the `SPACE_ENABLED` set.
- Repository: `upsertSamples` unchanged. `samplesBetween` aggregates per series by
  `SERIES_AGGREGATE` from the shared package (`max` for `kp_1m`, `kp_3h`, `kp_gfz`, `ap`,
  `xray_long`, `xray_short`, `p10`, `p100`, `hp_north`, `hp_south`; `min` for `dst`, `bz_gsm`;
  `mean` for `bt`, `speed`, `density`, `ssn`, `f107`), so a wide bucket keeps the storm. New
  `preliminaryKpFrom(db)`: the earliest `gfz-pre` time, or null.
- Route `GET /api/space/window`: `SPACE_WINDOW_MAX_MS` becomes 100 years; flares, alerts and
  scales are read only when the span is within `SPACE_DETAIL_MAX_MS` (93 days) and come back
  empty beyond it. The response gains `preliminaryKpFrom: string | null`. Cache stays 60 s.

## Web

- `lib/space.ts`: `WINDOWS` adds `1y`, `11y` and `all` (Since 1932; `rangeBounds` starts it at
  1932-01-01T00:00Z); `MAX_RANGE_MS` is 100 years; `isLongRange(from, to)` is true past 93 days;
  the store polls every ten minutes instead of one while the range is long.
- `lib/space-chart.ts`: `RowSpec.long: boolean`: rows drawn when the range is long are `kp`, `dst`
  and the new `sun` (`ssn` left, `f107` right, label "Sunspots · F10.7", units "" and "sfu",
  domains `spanAtLeast(v, 0, 100)` and `spanAtLeast(v, 50, 150)`); the short set is today's
  seven. `kpBars(points, x, y, bottom, widthMs)` takes the bar width (3 h, or the bucket when
  wider). `stepPath(points, x, y, gap)` draws a 3-hourly value as a step. `CADENCE_MS` and the
  stack's `SHORT` names gain the four series.
- Kp row: short range draws `kp_3h` bars under the `kp_1m` line as today, plus `kp_gfz` as a thin
  step (`.sline.kp_gfz`), split at `preliminaryKpFrom` into a solid definitive path and a dashed
  preliminary one. Long range draws `kp_gfz` bars coloured by G level and no lines. The readout
  shows `Kp 4.33 · 3-h 4⁻ · GFZ 4⁺ (prelim.) · Δ +⅓` when both exist, in thirds.
- `lib/cycles.ts`: `CYCLES` (number, minimum, maximum|null), `cycleMarks(from, to, x): EraMark[]`
  with `label` "Cycle 24" and a note naming the minimum and maximum months; `SpaceStack` draws
  them along the top when the span exceeds two years, tiered by `eraLabels`, and the alert ticks
  only when the span is within 93 days.
- `SpaceRefine`: the caption names the aggregate ("Points are 23-day maxima (Kp, fluxes), minima
  (Dst, Bz) and means over this window"). `SpacePage` hides the flares rail and the alert cards
  when the range is long and shows one line in their place: "Flares, alerts and the minute-scale
  rows need a window of 93 days or less."
- `SpaceStatus` unchanged. Tiles unchanged (they read `latest`).

## Credits

Footer paragraph and README table gain GFZ Potsdam (Kp, ap, Ap, sunspot number, F10.7, CC BY
4.0, Matzka et al. 2021) and Kyoto's hourly Dst now read directly from the WDC (doi, non-commercial
use, real-time values are quicklook).

## Testing

Server: client against an injected fetch (URL building, clipping to the HAPI range, 400 on an
out-of-range request surfaces as `SpaceHttpError`), parsers on trimmed fixtures
(`test/fixtures/gfz/*.json`, `test/fixtures/kyoto/hour_dst.csv`: status mix, nulls, fill,
bin-centre flooring), repository (aggregate per series, `preliminaryKpFrom`, superseded delete),
job and backfill with a history stub (`test/support/history-stub.ts`), route (cap, detail cut-off,
new field). Web: windows and bounds, long-range row set, `stepPath`, bar width, cycle marks,
readout text, poll interval. 100 % on all three packages.

## Out of scope

AE/ASY indices, INTERMAGNET observatories, monthly smoothed sunspot numbers, F10.7 adjusted,
exporting series, Dst status display, several windows side by side.
