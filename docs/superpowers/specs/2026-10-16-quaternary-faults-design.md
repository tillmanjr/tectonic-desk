# Quaternary faults on the West Coast view

Date: 2026-10-16. Status: approved.

## Goal

Draw the USGS Quaternary Fault and Fold Database traces on the West Coast map,
coloured by age of last movement in the USGS convention, with a hover tooltip
naming the fault, its section, age, slip rate, slip sense and dip. The data is
pulled once by a generator script and checked in; the running system never
talks to USGS GIS.

## Source

USGS Qfaults ArcGIS service, layer 21 "National Database" (polylines, GeoJSON
output, 2000 records a page, pagination supported):

`https://earthquake.usgs.gov/arcgis/rest/services/haz/Qfaults/MapServer/21/query`

Fields used: `fault_name`, `section_name`, `fault_id`, `section_id`, `age`,
`slip_rate`, `slip_sense`, `dip_direction`, `symbology`, `fault_url`.
`symbology` is `<age> <certainty>` where age is one of `historic`, `latest
Quaternary`, `late Quaternary`, `middle and late Quaternary`, `undifferentiated
Quaternary`, `unspecified`, `class B` and certainty is `Well Constrained`,
`Moderately Constrained` or `Inferred`. The West Coast bbox (lon −136..−104,
lat 27..53) intersects about 110,000 pieces.

## Generator

`apps/server/src/qfaults-cli.ts`, run as `pnpm --filter @tectonic/server geo:qfaults`.

1. Page the layer with `geometry=<bbox>`, `geometryType=esriGeometryEnvelope`,
   `inSR=4326`, `outSR=4326`, `outFields=<the fields above>`, `f=geojson`,
   `resultOffset` stepping by `resultRecordCount=2000` until a page comes back
   without `exceededTransferLimit`.
2. Pure functions in `apps/server/src/geo/qfaults.ts`:
   - `parseSymbology(s)` → `{ age: AgeCode; cert: Cert }`; unknown text maps
     to `other` / `well`.
   - `mergeTraces(features)` groups pieces by fault id, section id, age code,
     certainty, slip rate, slip sense and dip direction into one feature each,
     geometry `MultiLineString`, coordinates rounded to 5 decimals,
     properties `{ id, name, section, age, cert, rate, sense, dip, url }`
     (`section`, `rate`, `sense`, `dip`, `url` null when blank).
   - `faultTopology(features, { quantization, minWeight })` builds a TopoJSON
     `Topology` with one object `faults` via `topojson-server`, then
     `presimplify` + `simplify(minWeight)` + `filter` from `topojson-simplify`,
     and quantises. Defaults: quantization 1e5, minWeight 1e-7 square degrees
     (about 30 m by 30 m); tuned at generation time to land under 2 MB.
3. The CLI writes `apps/server/data/geo/wc-qfaults.json` and prints the
   piece count, feature count and byte size. `data/geo/README.md` records
   the command and the pull date.

`topojson-server` and `topojson-simplify` become server dependencies (no
transitive dependencies). The CLI is an excluded entry point like the other
`*-cli.ts`; the functions are covered by tests on a trimmed real page saved
under `apps/server/test/fixtures/usgs/qfaults-page.json`.

## Age codes

| code       | symbology age                 | label                            | colour var    |
| ---------- | ----------------------------- | -------------------------------- | ------------- |
| `historic` | historic                      | Historic (<150 yr)               | `--qf-hist`   |
| `latest`   | latest Quaternary             | Latest Quaternary (<15 ka)       | `--qf-latest` |
| `late`     | late Quaternary               | Late Quaternary (<130 ka)        | `--qf-late`   |
| `mid`      | middle and late Quaternary    | Middle–late Quaternary (<750 ka) | `--qf-mid`    |
| `undiff`   | undifferentiated Quaternary   | Quaternary (<1.6 Ma)             | `--qf-undiff` |
| `other`    | unspecified, class B, unknown | Age unspecified or Class B       | `--qf-other`  |

Colours follow the USGS interactive map (red, orange, green, blue, near-black,
grey) in the light theme and brighter tints in the dark theme, defined as CSS
variables beside the existing palette. Certainty sets the dash: `well` solid,
`mod` dashed `5 3`, `inf` dotted `1.5 3`. Width 1.2 px, non-scaling.

## Server

`wc-qfaults` joins `GEO_NAMES` in `src/geo/assets.ts`; it is served by the
existing `GET /api/geo/:name` with ETag and a one-day cache.

## Web

- `GeoName` gains `"wc-qfaults"`.
- `src/lib/geo.ts`: `AgeCode`, `Cert`, `FAULT_AGES: Record<AgeCode, { label; color }>`,
  `FAULT_DASH: Record<Cert, string | null>`, `FaultProps`,
  `faultFeatures(topo): Feature<MultiLineString, FaultProps>[]` (via
  `topojson-client` `feature`), `faultTitle(props)` → "Hayward fault, Southern
  section · Latest Quaternary (<15 ka) · 1–5 mm/yr · Right lateral · Dip NE"
  (blank parts dropped; the dip reads "Dip vertical" / "Dip NE").
- `MapFaults.vue`: props `path`, `features`; emits `hover { index, title, x, y }`
  and `leave`; renders, per feature, a transparent 8 px hit path and the
  visible path with the age colour and certainty dash, accent colour and
  width +1 when hovered. Same shape as `MapPlates.vue`.
- `QuakeMap.vue`: `showFaults` ref (default true), a "Quaternary faults"
  checkbox rendered only when the region has a bbox (the West Coast view);
  the layer loads on first show in that view and is cached for the session;
  failures log to the console like plates. Drawn above the basemap, below
  plates. Hover goes through `showTip` with the plate lift.
- `MapLegend.vue`: when the layer is on (new `faults` prop), six age swatches
  and one note "dashed: moderately constrained · dotted: inferred".
- `App.vue` footer gains "Quaternary faults: USGS Quaternary Fault and Fold
  Database of the United States" with a link to
  `https://www.usgs.gov/programs/earthquake-hazards/faults`.
- Layer toggles stay out of the URL, as the others do.

## Tests

Server: `parseSymbology`, `mergeTraces` (grouping, rounding, nulls, multi-line
pieces), `faultTopology` (one object, arcs quantised, simplification drops a
collinear point) on the fixture; the assets test picks the new name up
through `GEO_NAMES`.

Web: `faultFeatures` and `faultTitle` on a small topology fixture
(`test/support/faults.ts`); `MapFaults` hover, leave and highlight; `QuakeMap`
shows the checkbox only in the West Coast view, loads the file once, toggles
the layer and logs a failed load; the legend shows swatches only with the
layer; the footer credit in the App test. Coverage stays at 100%.

## Docs

README front-end bullet and data credit, CLAUDE.md front-end line and the
regeneration command, `data/geo/README.md` entry.

## Out of scope

Faults outside the West Coast bbox, fault areas (layer 22), a per-fault detail
panel, URL state for layer toggles.

## Implementation notes (2026-10-16)

- The pieces rarely share a vertex where one trace continues into the next
  (typical end gaps are a few tens of metres), so `mergeTraces` stitches ends
  within 50 m (`STITCH_TOLERANCE`, under a pixel at full zoom) before
  simplifying. Even so about 85,000 separate lines remain; the file is 5 MB
  raw and 1.2 MB gzipped at the chosen 3e-6 square-degree threshold
  (`DEFAULT_MIN_WEIGHT`), not the 2 MB hoped for. nginx gzips it in
  production and the layer loads once per session.
- `url` was dropped from the properties: it is the same USGS report URL for
  every feature, parameterised by the fault and section ids.
- Rendering: with ~8,000 features, per-feature hit and line paths were
  replaced by one path per age and certainty class (`MapFaults.vue`) and a
  d3-quadtree of projected vertices (`faultIndex`) that the map's `mousemove`
  queries within 6 px; plate and event groups carry `data-hit` so their own
  tooltips win. The hovered trace is redrawn once in the accent colour.
- The generator accepts a cache file argument so the threshold can be tuned
  without refetching the 110,000 pieces.
- 2026-10-16, later: the single checkbox became a toolbar menu, "Quaternary
  faults: All ▾", listing the six age classes as checkboxes with All and
  None; the layer, the hover index and the legend follow the selection, and
  an empty selection means no layer.
