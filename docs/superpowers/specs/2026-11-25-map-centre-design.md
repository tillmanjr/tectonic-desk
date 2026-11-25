# Global map centre

Date: 2026-11-25. Status: built (branch `rotate-globe`).

## Why

The global map is Natural Earth centred on 150°E, which puts the Pacific rim together. A reader
following the Atlantic, Africa or the Americas wants the seam somewhere else.

## Decisions

- **Control**: on global views only, a Centre control over the map's bottom-left corner (moved there
  from the toolbar at the reader's request, as map apps place such controls; faded like the theater
  button until pointed at or used): ‹ and › nudge 15°, a slider, the current longitude, and ↺ back to
  150°E. The slider runs from 180° west to 180° east of the default, so 150°E sits in its middle with
  a detent (a drag snaps there within 5°; arrow keys step through) and a tick under it.
- **Globe**: while the control is focused or pressed, a small orthographic globe with schematic land
  (world-atlas 110m) turns with every slider step, the current centre's meridian solid and 150°E
  dashed, both longitudes written under it. It sits to the right of the control, bottoms level, so
  the control's hint (above or below it) never covers it; the map card clips its contents, so the
  globe is teleported to the body and fixed there.
- **Applying**: the map re-projects when the slider is released (or on each key press); the globe
  alone follows a drag. The zoom level and the place under the middle of the view are kept.
- **State**: the route, `?lon=` (omitted at 150°E), so links reproduce the view; it survives page and
  region switches, and the West Coast view ignores it. A reader setting for the default longitude may
  come later.
- **Field overlays**: drawn for 150°E only. Away from it the Field select is disabled, with a hint
  saying why; the choice is kept and shows again back at 150°E.
- Mark thumbnails stay at 150°E.

## Field overlays away from 150°E (for later)

WebAssembly would not change much: the cost is a per-pixel inverse projection and a colour lookup,
which a JIT runs within a small factor of WASM. Natural Earth with a longitude-only rotation is
separable, x = λ·A(φ) and y = B(φ), so the inverse needs one Newton solve per row and a division per
pixel: about 1.2 M cheap operations for a 1536 px image, tens of milliseconds in plain JS (in a
worker if needed, or a WebGL shader). The real work is in `geo:fields`, which would ship plain
longitude–latitude rasters for the browser to re-project.

## Revised after use

- A faint dashed line down the centre's meridian on the global map (`path.centreline`, accent at 45%,
  a hairline at any zoom through `vector-effect`).
- The globe shows on hover too, and stays `HOVER_GRACE_MS` (300 ms) after the pointer leaves so it
  can cross to the globe.
- The globe can be grabbed and dragged left or right: its width spans the visible hemisphere, so a
  drag of the full width turns 180°; dragging the surface right brings the west into the middle; the
  detent at 150°E catches it; the map follows on release.

## As built

- `src/lib/centre.ts` (`DEFAULT_CENTRE`, `parseCentre`/`centreQuery`, `fmtLon`, `offsetOf`/`lonOfOffset`,
  `snapOffset`), `frameFor(region, centre)` in `geo.ts`, `CENTRE`/`SET_CENTRE` keys provided by
  `App.vue`, `useMapView`'s `centre`, `setCentre` and `fieldAvailable`, and a watcher that keeps the
  zoom and the middle of the view across a turn (back to the whole map when the middle is off the
  globe).
- `MapCentre.vue` in `MapShell`'s map wrapper; `loadGlobeLandOnce` in `basemap-cache.ts`.
- The map navigation deep dive gains a Centre step (it turns to 30°W and back); its Selecting step now
  mentions Settings → Auto-zoom event.
- Tours: a Centre step in the Map tools quick tour (turns to 30°W, the Field select greyed, back on
  leaving), detouring to the `map-centre` deep dive in the Map chapter: where the map is centred, the
  Atlantic in the middle, the slider, nudges and ↺, the globe, the centre line, the zoom kept, fields
  at 150°E only, the address. The step first added to the navigation dive moved there. The glossary
  gains "Centre longitude".
