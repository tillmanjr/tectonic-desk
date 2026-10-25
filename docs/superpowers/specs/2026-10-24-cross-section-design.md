# Cross-section: a depth profile along a line drawn on the map

Date: 2026-10-24. Sub-project: Front end. Status: approved, one PR with a commit per task.
Design approved through a mockup (section tool in the toolbar; width, exaggeration and Clear on
the profile).

## Why

The classic view of a subduction zone is a vertical slice: hypocentres plotted by depth against
distance along a line across the strike, where the Wadati-Benioff zone dips away from the
trench. The desk has the hypocentres and the map; a section line and a profile panel turn them
into that view.

## Decisions

| Topic       | Decision                                                                                                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defining    | A `Section` tool in the map toolbar; two clicks place A and A′, end handles drag afterwards. Typed endpoints are a backlog item.                                                                                                   |
| Showing     | A full-width profile panel between the map and the table-and-charts row on the Earthquakes and Active Earth pages, only while a section exists. Active Earth also marks corridor volcanoes at the surface.                         |
| Where       | The route: `?section=lon1,lat1,lon2,lat2,halfKm`. Survives page and region switches, is kept by a mark, undone by the back button. Components call `SET_SECTION`, never the router.                                                |
| Controls    | Corridor half-width (km), vertical exaggeration (×1, ×2, ×4) and Clear sit in the profile's title. The toolbar only arms the tool.                                                                                                 |
| Scale       | The plot keeps the chosen ratio exactly: at ×1, one km down equals one km along. Height follows the deepest event, capped at 480 px; events deeper than the axis are counted in the caption, not squashed.                         |
| Events      | The catalog's `filtered` events (the window and the Refine bar) with a depth, within the corridor, projected onto the line. Events without a depth are counted in the caption.                                                     |
| Marks on it | Colour by depth class (`depthColor`), radius from magnitude, the selected event ringed, click selects. Volcanoes as triangles at the surface with names.                                                                           |
| Geometry    | Great circles on a sphere (R = 6371 km); fine at these scales and consistent with d3-geo. Signed off-line distance; the along-distance may fall before A or beyond A′, in which case the event is outside the section and dropped. |
| Touch       | Handles use `touch-action: none` and pointer capture, so a finger can drag them on the locked map. Placing points works by tap on the locked map too, since a tap is not a zoom gesture.                                           |

## 1. Geometry (`src/lib/section.ts`)

```ts
export interface Section {
  a: [number, number]; // lon, lat
  b: [number, number];
  halfKm: number;
}
export const DEFAULT_HALF_KM = 50;
export const HALF_KM_RANGE: [number, number] = [5, 500];
export const EARTH_RADIUS_KM = 6371;

/** `lon1,lat1,lon2,lat2,halfKm` → Section, or null when malformed, out of range or degenerate (A = A′). */
export function parseSection(v: unknown): Section | null;
/** The query value, numbers at 3 decimals (half-width at 0). */
export function sectionQuery(s: Section): string;

export function lengthKm(s: Section): number;
/** Initial bearing from A, degrees clockwise from north, 0–360. */
export function azimuth(s: Section): number;
/** "N 84° E" style compass text. */
export function azimuthText(deg: number): string;

export interface Projected {
  alongKm: number; // 0 at A, lengthKm at A′
  offKm: number; // signed, positive to the right of A→A′
}
/** Where a point falls relative to the line, by great-circle geometry on unit vectors. */
export function projectOnto(s: Section, lon: number, lat: number): Projected;

export interface ProfilePoint {
  id: string;
  alongKm: number;
  depthKm: number;
  mag: number | null;
  event: ApiEvent;
}
export interface Profile {
  points: ProfilePoint[];
  /** Events in the corridor that have no depth. */
  noDepth: number;
}
/** Events inside the corridor (|off| ≤ halfKm, 0 ≤ along ≤ length) with a depth. */
export function profileOf(s: Section, events: ApiEvent[]): Profile;

export interface SurfacePoint {
  number: number;
  name: string;
  alongKm: number;
}
export function surfacePointsOf(s: Section, volcanoes: Volcano[]): SurfacePoint[];

/** The corridor as a closed lon/lat ring: the great circle offset by halfKm on each side, N = 32 steps. */
export function corridorRing(s: Section): [number, number][];
/** A lon/lat `steps` of the way from A to A′ along the great circle. */
export function pointAlong(s: Section, t: number): [number, number];
```

Vector maths: `toVec(lon, lat)`, `cross`, `dot`, `normalise`. Let `n = normalise(a × b)` be the
great-circle normal. For a point `p`: `offKm = asin(dot(p, n)) · R` (signed), and
`alongKm = atan2(dot(cross(a, p'), n), dot(a, p')) · R` where `p'` is `p` projected onto the
plane (`p − dot(p, n)·n`, normalised). Corridor offset: for `t` in 0..1 along the circle, `q = pointAlong(t)`, and the offset points are
`normalise(q·cos(δ) ± n·sin(δ))` with `δ = halfKm / R`. The ring is the left side forward, then
the right side back.

## 2. Route and keys

`keys.ts`: `SECTION: InjectionKey<Readonly<Ref<Section | null>>>` and
`SET_SECTION: InjectionKey<(s: Section | null) => void>`. `App.vue`: `routeSection = computed(()
=> parseSection(route.query.section))`, provided as `SECTION`; `setSection(s)` does
`router.replace({ query: { ...route.query, section: s === null ? undefined : sectionQuery(s) }
})`. The key is not in `SELECTION_KEYS`, so page and region switches keep it.

`test/support/mount.ts`: context gains `section: Ref<Section | null>` and `setSection: Mock`.

## 3. Tool (`src/lib/section-tool.ts`)

```ts
export interface SectionTool {
  armed: Ref<boolean>;
  /** The first point while placing, else null. */
  pending: Ref<[number, number] | null>;
  /** Pointer position while a line is being placed or dragged, as lon/lat; null otherwise. */
  cursor: Ref<[number, number] | null>;
  /** What the map draws: the committed section, or the draft while dragging a handle. */
  shown: ComputedRef<Section | null>;
  toggle(): void; // arm or disarm (disarming drops a pending point)
  cancel(): void;
  /** A click on the map at lon/lat while armed: sets A, then A′ and commits with the default half-width. */
  place(lonLat: [number, number]): void;
  hover(lonLat: [number, number] | null): void;
  /** Handle drag: begin with which end, move with the new lon/lat, end commits. */
  dragStart(end: "a" | "b"): void;
  dragMove(lonLat: [number, number]): void;
  dragEnd(): void;
  clear(): void;
  setHalfKm(km: number): void; // clamped to HALF_KM_RANGE
}
export function useSectionTool(
  section: Readonly<Ref<Section | null>>,
  set: (s: Section | null) => void,
): SectionTool;
```

`useMapView` gains `invertPointer(ev: MouseEvent | PointerEvent): [number, number] | null`
(projected pointer → `projection.invert`), exported for the tool's callers; the existing
`projectedPointer` is reused. Escape handling: `MapShell` listens on `keydown` while armed and
calls `cancel`. The Escape listener must not steal the marks overlay's Escape: it is registered
only while armed.

## 4. Map layer (`MapSection.vue`)

Props: `section: Section`, `frame: MapFrame`, `path: GeoPath`, `k: number`, `pending?`,
`cursor?`. Draws, inside the layers slot of `QuakeMap` and `CombinedMap`:

- the corridor polygon (`path({ type: "Polygon", coordinates: [corridorRing] })`), class
  `corridor` (accent fill 0.1, dashed accent stroke 0.45);
- the line as a `LineString` through 32 `pointAlong` samples so it follows the great circle;
- while placing: a rubber `LineString` from `pending` to `cursor`;
- handles: circles at A and A′ with `r = 7 / k`, class `handle`, `touch-action: none`,
  `@pointerdown.stop` → `setPointerCapture`, `dragStart`; `@pointermove` → `dragMove(invert)`;
  `@pointerup` / `@pointercancel` → `dragEnd`;
- labels `A` and `A′` offset from the handles, font size `12 / k`.

`MapShell` gains a `section` tool button in the toolbar (`aria-pressed`, title "Draw a
section line: click two points"), passes `mv` plus the tool through the `layers` slot props
(`sectionTool`), and the svg's `@click` calls `place(invert)` while armed (a click that ends a pan is ignored:
`MapShell` records the last pointerdown position and skips a click more than 3 px away from it). `@mousemove` also feeds `hover`.

Since `useSectionTool` needs `SECTION`/`SET_SECTION`, `useMapView` creates it (`mv.section`) from
`inject`ed keys passed through options: `MapViewOptions` gains `section` and `setSection`, and
`QuakeMap`/`CombinedMap` inject the keys and pass them in.

## 5. Profile (`SectionProfile.vue`)

Rendered by `EarthquakesPage` and `ActiveEarthPage` after the map, `v-if` a section exists.
Props: `volcanoes?: boolean` (Active Earth passes true).

Layout constants: `W = 900`, `M = { l: 44, r: 16, t: 18, b: 26 }`, `MAX_H = 480`, `MIN_H = 140`.
Data (computed):

- `profile = profileOf(section, catalog.filtered)`; `length = lengthKm`.
- `kmPerPx = length / (W − M.l − M.r)`; `ve ∈ {1, 2, 4}` (local ref, default 1).
- `deepest = max(points.depthKm, 0)`; `axisKm = min(deepest rounded up to a 10 km step and at least 20, (MAX_H − M.t − M.b) · kmPerPx / ve)`; `plotH = axisKm / kmPerPx · ve`, at least `MIN_H − M.t − M.b`.
- `H = plotH + M.t + M.b`; `x(along) = M.l + along / kmPerPx`; `y(depth) = M.t + depth / kmPerPx · ve`.
- `tooDeep = points with depthKm > axisKm`, not drawn.
- ticks: `ticksOf(scaleLinear([0, length], [M.l, W − M.r]), 6, "~s")` with km; y ticks
  `ticksOf(scaleLinear([0, axisKm], [M.t, M.t + plotH]), 5)`.
- markers: `r = 2 + max(0, mag − floor) × 1.2` (null mag → 2); `fill = depthColor(depthKm)`;
  `<title>` with magnitude, place, depth; selected ringed with a 1.5 px ink stroke of `r + 3`.
- volcanoes: `surfacePointsOf(section, volcanoes.inRegion)` as triangles (base 10, height 9) at
  `y(0)`, name labels above, class `volc`; clicking one calls `SELECT_VOLCANO`.
- title: `Section A–A′ · {azimuthText} · {length} km · {points.length} events`.
- controls: `± <input type=number min=5 max=500 step=5>` km (change → `setHalfKm` through
  `SET_SECTION`), `vertical ×` `<select>` 1/2/4, `Clear` (plain button, no confirm; the back
  button restores).
- caption: `Depth against distance along A–A′ at ×{ve}{ve === 1 ? " (true scale)" : ""}; events within ±{half} km of the line, projected onto it; colour by depth class, size by magnitude.` plus `{n} deeper than {axisKm} km not shown.` and `{m} without a reported depth not shown.` when non-zero. Empty corridor: `No events with a depth within ±{half} km of the line.`

Styles: `.sectionpanel` as a `.panel` with the chart svg at 100% width; `.corridor`, `.sline`,
`.handle`, `.slabel`, `.volc` rules; the tool button like the other toolbar pills with the
pressed state in accent.

## 6. Tests

- `test/lib/section.test.ts`: parse (valid, short, non-numeric, out-of-range half, A = A′),
  query round trip at 3 decimals; `lengthKm` and `azimuth` on known pairs (equator east 111.19
  km per degree, meridian north, SF→LA ≈ 559 km at ≈ 137°); `projectOnto` for a point on the
  line, left and right of it, before A and beyond A′; `profileOf` filtering and `noDepth`;
  `surfacePointsOf`; `corridorRing` has 66 points, symmetric about the line, first and last
  equal; `pointAlong(0)` = A, `pointAlong(1)` = A′; `azimuthText` quadrants.
- `test/lib/section-tool.test.ts`: arm, place A, hover, place A′ commits with the default
  half-width, disarm drops a pending point, drag start/move/end commits once, clear,
  setHalfKm clamps.
- `test/components/QuakeMap.test.ts`: the tool button arms, two svg clicks commit a section via
  `ctx.setSection`, Escape cancels, a handle drag commits, the layer renders corridor, line,
  handles and labels for a route section.
- `test/components/SectionProfile.test.ts`: marks and ticks for a fixture section across
  `fakeApi`'s events, true-scale height, ×4, the deep cutoff and the no-depth caption, click
  selects, the half-width input and Clear call `setSection`, volcano triangles on Active Earth.
- `test/components/App.test.ts`: `?section=` parses into the provided ref and `setSection`
  writes it back.
- Coverage stays at 100%.

## 7. Docs

README **Cross-section** bullet; CLAUDE.md front end bullet naming `section.ts`,
`section-tool.ts`, `MapSection.vue`, `SectionProfile.vue`, the `SECTION`/`SET_SECTION` keys and
the query key.

## Out of scope, recorded for later

Typed endpoints; a bathymetry or topography line along the section; slab model overlays
(Slab2); saving several sections; sections on the Volcanoes page.
