# Measure

A `Measure` button beside `Section` on every map: click two points, drag either end, and read the
distance between them, live while placing and dragging. Click the button again to clear.

## Decisions

- The reading, on a sphere of mean radius 6371 km (`src/lib/measure.ts`, `measureOf`): angular
  distance Δ (degrees, what a seismologist reads epicentral distance in), surface great-circle
  distance, the straight chord through the interior, how deep the chord's midpoint dips
  (R(1 − cos Δ/2)) and the PREM layer at that depth (crust to 24.4 km, upper mantle to 410,
  transition zone to 660, lower mantle to 2891, outer core to 5150, inner core). The sphere is
  within about 0.5 % of the WGS84 geodesic, stated in the button's hint.
- Ephemeral: the line lives in `useMapView` (a `useSectionTool` over a local ref, `halfKm`
  unused), not the route or storage, and survives region switches like the section does.
- Arming Measure, Section or Pin stands the others down; Escape cancels placing.
- Look, distinct from the section (teal, solid, round A/A′ handles, corridor) and the pin
  (magenta teardrop): an ink dashed great-circle line on a light halo, diamond handles, and the
  two-line reading in a boxed monospaced label at the midpoint, under the line when there is no
  room above. Constant screen size; handles take a finger-sized press like the section's.
