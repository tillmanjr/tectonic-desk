# Section relief: topography and bathymetry along the cross-section

Date: 2026-10-24. Sub-project: Server and front end. Status: approved, built on the
`cross-section` branch before its merge. Extends `2026-10-24-cross-section-design.md`.

## Why

A section without the surface is half a picture: the trench floor, the forearc and the arc are
the frame the hypocentres sit in. Hypocentre depths are referenced to sea level, so a combined
topography-and-bathymetry grid drops straight into the profile's frame.

## Decisions

| Topic    | Decision                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source   | SRTM15+ v2.7 (Tozer et al. 2019) as GMT's `earth_relief_03m_p`: eight 90° JPEG 2000 tiles of 1800×1800 signed 16-bit samples at a 0.5 m scale, about 30 MB. Land-only elevation services were rejected because they lose the sea floor.                                                    |
| Where    | The server image: its build stage runs `pnpm --filter @tectonic/server geo:relief`, which downloads and decodes the tiles with the OpenJPEG wasm codec (a dev dependency) and writes `data/relief/earth_relief_03m.i16`, a 7200×3600 raw grid of metres, 52 MB, gitignored.                |
| Serving  | `GET /api/relief?section=lon1,lat1,lon2,lat2&n=256` samples the grid bilinearly at n points along the great circle and answers `{ stepKm, metres }`, cached for a day. Without the file the route answers 404 and the profile draws no relief.                                             |
| Drawing  | The classic filled section: sea level at depth 0, the surface curve above or below it, tan land fill above sea level, pale blue water fill between sea level and the sea floor. The depth axis extends above zero to the highest point along the line, at the same scale and exaggeration. |
| Geometry | Great-circle interpolation moves to `packages/shared` (`greatcircle.ts`: `toVec`, `slerp`, `distanceKm`) so the server and the web share it; `section.ts` keeps its API and delegates.                                                                                                     |
| Credits  | Tozer et al. 2019 (doi:10.1029/2019EA000658) joins the footer paragraph and the README table, alongside the GMT citation already there.                                                                                                                                                    |

## 1. Shared (`packages/shared/src/greatcircle.ts`, `api.ts`)

```ts
export type LonLat = [number, number];
export const EARTH_RADIUS_KM = 6371;
export function toVec(p: LonLat): [number, number, number];
export function toLonLat(v: [number, number, number]): LonLat;
/** The point `t` (0..1) of the way from a to b along the great circle; a when they coincide. */
export function slerp(a: LonLat, b: LonLat, t: number): LonLat;
export function distanceKm(a: LonLat, b: LonLat): number;
```

```ts
export interface ApiRelief {
  /** Spacing of the samples along the line, km. */
  stepKm: number;
  /** Elevation at each sample, metres above sea level (negative below). */
  metres: number[];
}
```

## 2. Server

### `src/geo/relief.ts` (pure, covered)

```ts
export const RELIEF = {
  width: 7200,
  height: 3600,
  cellDeg: 0.05,
  scale: 0.5,
  tileSize: 1800,
} as const;
/** The eight tiles and the lon/lat of their north-west corner. */
export const RELIEF_TILES: { name: string; lon: number; lat: number }[];
/** The JPEG 2000 codestream inside a JP2 container (the `jp2c` box), or the input when it is already a raw codestream. */
export function jp2Codestream(file: Uint8Array): Uint8Array;
/** Copies a decoded tile (row 0 north) into the global grid at its corner; scales to metres. */
export function placeTile(grid: Int16Array, tile: Int16Array, lon: number, lat: number): void;
/** Bilinear elevation in metres at a lon/lat; row 0 is 90°N, column 0 is 180°W, pixel-registered. Longitude wraps. */
export function sampleRelief(grid: Int16Array, lon: number, lat: number): number;
/** `n` elevations along the great circle from a to b, with their spacing. */
export function reliefAlong(grid: Int16Array, a: LonLat, b: LonLat, n: number): ApiRelief;
/** Reads the raw grid if the file exists, else null. */
export function loadRelief(path: string): Int16Array | null;
```

`DEFAULT_RELIEF_FILE` resolves `data/relief/earth_relief_03m.i16` beside `data/geo`.

### `src/relief-cli.ts` (excluded from coverage)

Downloads each tile into `.cache/relief/` unless present, decodes it with
`@cornerstonejs/codec-openjpeg` (`J2KDecoder`), places it, writes the `.i16` file and a
`earth_relief_03m.json` sidecar `{ source, doi, grid, generated }`. Usage line in the header.

### Route (`src/routes/relief.ts`)

Schema in `schemas.ts`: `reliefQuerySchema = z.strictObject({ section: z.string().transform(parseFourNumbers).pipe(z.tuple([lon, lat, lon, lat])), n: z.coerce.number().int().min(2).max(1024).default(256) })`.
Handler: if `app.relief === null` → `notFound("relief grid not available")`; else
`cacheFor(reply, 86_400)` and `reliefAlong(app.relief, a, b, n)`.

`buildApp` gains `reliefFile?: string | null` (default `DEFAULT_RELIEF_FILE`; `null` means none)
and decorates `relief`.

### Dockerfile

After `COPY apps/server apps/server`: `RUN pnpm --filter @tectonic/server geo:relief`. The
`files` field already ships `data/`, so `pnpm deploy` carries the grid. `.gitignore` gains
`apps/server/data/relief/` and `apps/server/.cache/`.

## 3. Web

- `api.relief(section: string, n: number): Promise<ApiRelief>` → `GET /api/relief?section=…&n=…`.
- `SectionProfile.vue`: `relief = shallowRef<ApiRelief | null>(null)`, `reliefFailed = ref(false)`;
  a `watch` on `sectionQuery(section)` (ignoring the half-width, so a width change does not
  refetch: watch `a`/`b` only) fetches with `n = 256`, latest request wins (sequence counter).
- Data: `aboveKm = max(0, max(metres) / 1000)`; the plot's top is `M.t + aboveKm / kmPerPx × ve`
  for depth 0, i.e. `y(depth) = M.t + (aboveKm + depth) / kmPerPx × ve`, and `plotH` grows by
  the same amount (still capped at `MAX_PLOT`, trading axis depth for height when needed).
  Relief polygons: `surface` path through `(x(i × stepKm), y(−metres[i] / 1000))`; `land` =
  the surface clipped above sea level closed along `y(0)`; `water` = below sea level closed along
  `y(0)`. Both drawn as one polygon each by walking the samples with the sea-level line as the
  base (the parts on the other side of sea level collapse to zero area, so no clipping maths).
- Caption gains `Relief: SRTM15+ v2.7 (Tozer et al. 2019) via GMT, 3′ grid.` or
  `Relief unavailable.` after a failed fetch.
- Styles: `.sectionsvg .land { fill: var(--land-fill, #b9a58a); opacity: 0.55 }`,
  `.sectionsvg .water { fill: var(--accent); opacity: 0.18 }`, `.sectionsvg .surface { stroke: var(--ink); fill: none; stroke-width: 1 }`.

## 4. Tests

- Shared: `slerp` ends and midpoint, coincident points, `distanceKm` on the equator.
- Server: `jp2Codestream` on a synthetic box sequence (and a raw codestream), `placeTile` corner
  placement with scaling, `sampleRelief` on a small synthetic grid (override `RELIEF` through a
  `layout` parameter so tests use a 8×4 grid), `reliefAlong` count and spacing, `loadRelief` with
  a temp file and a missing path; the route with a temp grid (`reliefFile`) and with `null`;
  schema rejections (three numbers, out of range, n too big).
- Web: `api.relief` URL; `SectionProfile` with `fakeApi({ relief })` draws the land and water
  polygons, extends the axis, puts the caption line in; a rejected fetch shows the unavailable
  note; a half-width change does not refetch.
- Coverage stays at 100% across server, shared and web.

## 5. Docs

README: a sentence in the Cross-section bullet, the SRTM15+ row in the credits table, the
`geo:relief` script in the Scripts table and a note that production builds fetch the tiles.
CLAUDE.md: the relief route, the grid file, the shared great-circle module.

## Out of scope

Finer grids (1′ or 15″), ice-surface versus bedrock choices, relief on the map itself.
