# Space weather: the aurora oval

Date: 2026-10-25. Sub-project 2 of the space weather series. Status: approved. Builds on
`docs/superpowers/specs/2026-10-25-space-weather-design.md`.

## Why

The aurora is the one piece of space weather a reader can go outside and see, and the OVATION
Prime model is how SWPC says where. SWPC publishes a fresh 1° probability grid every five minutes
and keeps only the newest one. Storing three days of frames lets the page show the oval as it is
now and as it breathed through the last storm.

## Scope

Both halves of the original item, in order:

1. **Polar pair on the Space page** (this spec): the server keeps 72 hours of OVATION frames,
   two API reads serve the index and one frame, and the Space page gains a full-width section
   with north and south polar maps, probability bands, night shading, hemispheric power and a
   scrub over the stored frames.
2. **World-map toggle** (backlog): the same bands drawn under the plate lines on the Active
   Earth, Earthquakes and Volcanoes maps, like Field, once the data path exists.

## Decisions

| Topic     | Decision                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where     | A full-width band under the stack and rail on the Space page: two polar maps side by side with a caption column. The indices stay first on the page; the maps get the width they need.                                                         |
| History   | Every frame kept 72 hours (864 frames, about 56 MB), since the solar wind takes one to three days to arrive and a storm is worth re-reading the next morning. Older frames are deleted by the ingest part itself, so the window is exact.      |
| Drawing   | Filled probability bands from d3-contour at 10, 30, 50, 70 and 90 %, projected through geoPath. Few nodes, quotable thresholds, and the same polygons will serve the world-map toggle later.                                                   |
| Maps      | Azimuthal equal-area about each pole, rim at 40° latitude, the subsolar meridian at the top so noon is up and the shaded night side is always the lower half. Land from the cached world basemap, graticule at 10° latitude and 30° longitude. |
| Power     | Hemispheric power (GW, north and south) from the small tabular file `text/aurora-nowcast-hemi-power.txt`, matched to the frame by observation time, null when absent. The two large per-hemisphere text dumps are not fetched.                 |
| Transport | The grid travels as a base64 string inside JSON (about 87 KB), one fetch per new frame or scrub step, cached by time in the web. Frames are immutable so the frame read caches for an hour.                                                    |
| Copy      | Always the observation time and the forecast time, "chance of aurora" for the bands, the OVATION Prime attribution, and never "aurora visible here".                                                                                           |
| Credits   | The footer paragraph and README rows name the OVATION Prime model beside SWPC.                                                                                                                                                                 |

## 1. Shared (`packages/shared/src/space.ts`, `api.ts`)

```ts
export const AURORA_WIDTH = 360; // longitudes 0..359
export const AURORA_HEIGHT = 181; // latitudes -90..90
export const AURORA_CELLS = AURORA_WIDTH * AURORA_HEIGHT; // 65 160
export const AURORA_RETENTION_HOURS = 72;
export const AURORA_THRESHOLDS = [10, 30, 50, 70, 90] as const;

/** Index of a cell in the grid, in the feed's own order (longitude-major). */
export const auroraIndex = (lon: number, lat: number): number => lon * AURORA_HEIGHT + (lat + 90);

/** One OVATION Prime frame: a probability (0..100) per 1° cell. */
export interface AuroraFrame {
  /** Solar wind observation the run was driven by. */
  observed: Date;
  /** The instant the probabilities are for, 30 to 90 minutes after `observed`. */
  forecast: Date;
  /** Hemispheric power, GW; null when the tabular file has no row for `observed`. */
  powerNorth: number | null;
  powerSouth: number | null;
  grid: Uint8Array;
}
export type AuroraFrameMeta = Omit<AuroraFrame, "grid">;
```

`api.ts`: `ApiAuroraFrameMeta = Json<AuroraFrameMeta>`; `ApiAuroraFrame = ApiAuroraFrameMeta & { grid: string }` where `grid` is the base64 encoding of the `AURORA_CELLS` bytes; `ApiAuroraIndex { generatedAt: string; frames: ApiAuroraFrameMeta[] }` (newest last).

## 2. Server

### Files and parsing

`SWPC_FILES` gains `fetchAurora: "/json/ovation_aurora_latest.json"` (`AuroraDoc`) and
`fetchHemiPower: "/text/aurora-nowcast-hemi-power.txt"` (text). `space/schema.ts`: a loose
object with `"Observation Time"`, `"Forecast Time"` (strings) and `coordinates:
[number, number, number][]`.

`space/parse.ts`:

- `parseAuroraFrame(doc): AuroraFrameMeta & { grid }` with null power. The grid is a zeroed
  `Uint8Array(AURORA_CELLS)`; each triple with an integer longitude in 0..359 and latitude in
  -90..90 writes `clamp(round(value), 0, 100)` at `auroraIndex`; other triples are skipped.
  Times go through the existing `parseTime`.
- `parseHemiPower(text): { observed: Date; north: number; south: number }[]`: skips blank and
  `#` lines, reads `YYYY-MM-DD_HH:MM` observation, forecast, north, south; rows that do not
  parse are skipped.
- `withPower(frame, rows)`: fills `powerNorth`/`powerSouth` from the row whose `observed`
  equals the frame's, else leaves null.

### Table

```ts
export const spaceAurora = pgTable("space_aurora", {
  observed: timestamp({ withTimezone: true }).primaryKey(),
  forecast: timestamp({ withTimezone: true }).notNull(),
  powerNorth: real("power_north"),
  powerSouth: real("power_south"),
  grid: customType<{ data: Uint8Array }>({ dataType: () => "bytea" })("grid").notNull(),
});
```

One generated migration; `space_aurora` joins the test truncate list.

### Repository (`repositories/space.ts`)

- `insertAuroraFrame(db, frame): Promise<number>`: on conflict do nothing on `observed`,
  returns the count of new rows.
- `pruneAurora(db, cutoff): Promise<number>`: deletes frames observed before `cutoff`.
- `auroraFrames(db, since): Promise<AuroraFrameMeta[]>`: metadata only, observed >= since,
  ascending.
- `auroraFrame(db, observed): Promise<AuroraFrame | null>`.
- `latestAuroraFrame(db): Promise<AuroraFrame | null>`.

### Job

A new part `aurora` in `syncSpaceFast`: fetch the frame, parse it, try the power file (a
failure logs a warning and leaves the pair null), insert, then `pruneAurora(db, now −
AURORA_RETENTION_HOURS)`. Returns the inserted count as its row count. No new config keys.

### Routes (`routes/space.ts`)

- `GET /api/space/aurora` → `ApiAuroraIndex` of frames observed in the last
  `AURORA_RETENTION_HOURS`; empty list when the store is empty; `cacheFor(reply, 60)`.
- `GET /api/space/aurora/:observed` → `ApiAuroraFrame`; the param is parsed with a zod ISO
  instant schema through `parseOrThrow` (400), unknown time 404; `cacheFor(reply, 3600)`.
  `serialize.ts` gains `toApiAuroraFrame` (`Buffer.from(grid).toString("base64")`) and
  `toApiAuroraFrameMeta`.

## 3. Web

### Store (`src/lib/aurora.ts`)

```ts
export interface DecodedFrame extends ApiAuroraFrameMeta {
  grid: Uint8Array;
}
export interface AuroraStore {
  frames: Ref<ApiAuroraFrameMeta[]>;
  /** Observation time on show, or null to follow the newest frame. */
  selected: Ref<string | null>;
  frame: Ref<DecodedFrame | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
  select(observed: string | null): void;
  load(): Promise<void>;
  start(): void;
  stop(): void;
}
export function createAuroraStore(api, readNow, { intervalMs = 60_000, doc }): AuroraStore;
export const decodeGrid = (b64: string): Uint8Array;
```

`load` fetches the index and then the grid of the frame on show (the selected time, else the
newest) unless cached; a `Map<string, Uint8Array>` keeps the most recent 48 grids. Polling runs
every minute while started and the document is visible, like the space store. `select(null)`
returns to following. `api.ts` gains `auroraIndex()` and `auroraFrame(observed)`; `keys.ts`
gains `AURORA`; `App.vue` creates the store and starts and stops it with the space store.

### Geometry

- `src/lib/aurora-bands.ts`: `auroraBands(grid): MultiPolygon[]`, one per threshold in
  `AURORA_THRESHOLDS`, from `d3-contour`'s `contours().size([360, 181]).thresholds(...)`.
  Contour coordinates map to cell centres: longitude `x − 0.5` wrapped to (−180, 180],
  latitude `y − 90.5` clamped to ±89.9 so an edge along a pole row is a small ring, not a
  point. Computed once per frame.
- `src/lib/sun.ts`: `subsolarPoint(date): [lon, lat]` from the low-precision solar position
  (mean anomaly, ecliptic longitude, declination, equation of time), within half a degree.
- `src/lib/aurora-map.ts`: `polarProjection(hemisphere, subsolarLon, size)`
  (`geoAzimuthalEqualArea`, rotate to the pole with the subsolar meridian up, `clipAngle(50)`,
  fitted to a square), `nightRing(subsolar)` (`geoCircle` radius 90° about the antipode),
  `polarGraticule()` (10° parallels from ±40, 30° meridians), `localTimeMarks` for 12 at the
  top and 00 at the bottom.

### Components

- `SpaceAurora.vue`: a full-width `<section class="aurora">` under `.spacegrid` in `SpacePage`.
  Two `AuroraMap` instances and a caption column. Empty index: "No aurora frames yet". Store
  error: shown inside the section. Caption: "Observed 12:12 UTC · forecast for 13:30 UTC",
  "Hemispheric power N 19.9 GW · S 19.2 GW" (an em dash for a null), five swatches labelled
  "chance of aurora" with the thresholds, the attribution "OVATION Prime (SWPC), probability of
  aurora over a point at the forecast time; night side shaded", and the scrub: an
  `<input type="range">` over the frame index (newest at the right) whose label shows the
  selected frame's observation time, and a `Latest` button that calls `select(null)`, disabled
  while following. Times follow the zone setting.
- `AuroraMap.vue` props `hemisphere: "north" | "south"`, `bands`, `forecast: Date`. An SVG
  with a square viewBox: the sphere outline, land (`loadBasemapFor` world land), graticule,
  night ring, the five bands weakest first, the pole dot and the 12/00 marks. No pointer
  interaction.

### Styles

`.aurora` is a three-column grid (map, map, caption) that stacks below 900 px; maps are
`aspect-ratio: 1`. Variables `--au-10 … --au-90` (teal to magenta, both themes), `--au-night`
for the shading. Land and ocean reuse the existing map variables.

## 4. Testing

- Server: fixture `test/fixtures/swpc/ovation.json` (a few dozen triples including the wrap
  column, both poles and an out-of-range triple) and `hemi-power.txt` (header plus three rows);
  parser tests for placement, clamping, skipping and power matching; repository tests for
  insert-once, prune, ascending metadata, the null pair and byte round-trip; route tests for the
  empty and filled index, the frame, 400, 404 and both cache headers; `space-stub` answers
  both new files.
- Web: `sun.test.ts` (equinox and solstice points), `aurora-bands.test.ts` (a synthetic ring
  grid: band count, wrap seam, pole clamping, an empty grid), `aurora-map.test.ts`
  (orientation, night ring, graticule), `aurora.test.ts` (poll, follow, select, cache cap,
  visibility, error), `SpaceAurora.test.ts` and `AuroraMap.test.ts` over `test/support/aurora.ts`
  (`auroraIndex()`, `auroraFrame()` with a ring grid), `App`, `api` and `keys` updates.

## Backlog

- World-map toggle: the bands under the plate lines on the three maps, a `MapShell` toggle.
- Hemispheric power as a stack row (two new series ids).
- Playback over the scrub.
