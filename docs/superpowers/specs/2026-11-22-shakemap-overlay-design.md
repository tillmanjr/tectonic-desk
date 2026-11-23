# ShakeMap overlay

For a selected earthquake with a USGS ShakeMap, the map can shade the estimated shaking:
Modified Mercalli Intensity bands centred on the rupture, read from the ShakeMap itself rather
than modelled here. Events without one get no overlay (a modelled fallback from an intensity
prediction equation is a possible later option, labelled as a model).

## Research (2026-11-22)

- Every ShakeMap product carries `download/coverage_mmi_{low,medium,high}_res.covjson`
  (CoverageJSON, a regular CRS84 grid, values to 0.1 MMI, USGS palette included) and
  `download/cont_mmi.json` (contour lines). The medium grid is about 150 × 150 nodes, 40 to 90 KB.
- Coverage over a 30-day M2.5+ feed: every M5.5+ event; most M3.5+ events from the regional US
  networks (the West Coast view); about 6 % of global M4.5 to 5.5 events.
- A ShakeMap's extent is USGS's choice, often only where MMI stays above about IV; for deep
  events it can be under 2° across, so its square edge is not an intensity boundary.

## Decisions

- Server: `GET /api/events/:id/shakemap` (`routes/events.ts`) answers `ApiShakeMap`
  (`packages/shared/src/shakemap.ts`: `ShakeMap`, `ShakeGrid` row-major from the south-west,
  `MMI_SCALE` with USGS colours and wording). It needs no database row: `createShakeMapCache`
  (`usgs/shakemap-cache.ts`, injected as `buildApp({ shakemaps })`) fetches the event's detail,
  picks the product (`pickShakeProduct`: highest `preferredWeight`, then newest, must have the
  medium coverage) and parses the coverage (`parseCoverage`, either axis direction). Ten-minute
  ttl, 64 events, the last copy served while USGS fails, "none" cached too; 404 when none,
  502 when USGS fails with no copy, `Cache-Control` ten minutes.
- `UsgsClient.fetchJson(url)` reads product files by absolute URL.
- Web: the `ShakeMap` toggle (`ShakeToggle.vue`) in the map toolbar of the Earthquakes and
  Active Earth maps, usable when the selected event's `types` list `shakemap`, with a note for
  loading, none, unavailable. `useShakeLayer` (`lib/layers.ts`) loads through `loadShakeMap`
  (once per event per page, 404 as none, failures retried) only while the toggle is on, and
  ignores answers for a selection that has moved on.
- `MapShake.vue` draws d3-contour bands at the half-integers (II and up; I is left clear) in
  USGS colours, each opaque inside one group at 50 % opacity so a point shows its own level,
  under the volcano and event markers, plus the ShakeMap's extent dashed.
- Readout: `MapView.probe` lets a page layer answer for the lon/lat under the pointer where no
  marker, boundary or fault has a tip; the ShakeMap answers the nearest node's MMI with its level,
  shaking and damage words. `ShakeLegendRow.vue` keys II to X+ and captions source, version,
  review status and maximum.
