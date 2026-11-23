# Map theater mode

Like a video player's theater mode: the map and its toolbar take the whole browser window, with
the rest of the page set aside until the reader leaves.

## Decisions

- A faded button in the map's bottom-right corner (the video-player convention; the toolbar was
  getting crowded) with corner-bracket icons that expand and, in theater mode, contract. It
  brightens on hover or focus. Escape also leaves; when a Section, Pin or Measure placement is in
  progress, the first Escape stands that down and the next leaves.
- `useMapView` holds `theater`, `stageEl`, `theaterSize` and `toggleTheater`. The map card becomes
  a fixed layer (z-index 35: over the page, the detail panel and the Marks rail; under the notice
  strip, hints and the Sun overlay). The map is fitted by script to the largest size at its
  frame's aspect inside the stage under the toolbar, so pointer arithmetic stays exact, and refits
  on window resize and region change (the West Coast frame is taller than wide).
- Kept: the toolbar, the pin and replay strips, the map's tooltips, hints and touch hints, and
  the corner lock and count. Set aside: the legend and the rest of the page; the body does not
  scroll.
- The map unlocks on entering (with the page set aside, wheel and drag should move the map) and
  gets its earlier lock back on leaving.
