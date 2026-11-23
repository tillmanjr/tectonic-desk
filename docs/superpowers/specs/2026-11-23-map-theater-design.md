# Map theater mode

Like a video player's theater mode: the map and its toolbar take the whole browser window, with
the rest of the page set aside until the reader leaves.

## Decisions

- A faded button in the map's bottom-right corner (the video-player convention; the toolbar was
  getting crowded) with corner-bracket icons that expand and, in theater mode, contract. It
  brightens on hover or focus. Escape also leaves; when a Section, Pin or Measure placement is in
  progress, the first Escape stands that down and the next leaves.
- `useMapView` holds `theater` and `toggleTheater`. The map card becomes a fixed layer (z-index 35:
  over the page, the detail panel and the Marks rail; under the notice strip, hints and the Sun
  overlay). The map covers the whole area under the toolbar (`preserveAspectRatio="xMidYMid
  slice"`): the West Coast frame fills the width and is cropped top and bottom, and the reader pans
  to the rest. `screenFit` turns the pointer into viewBox units through that scale and centring, so
  placements and lookups stay exact; on the page the box keeps the frame's aspect as before.
- Kept: the toolbar, the pin and replay strips, the map's tooltips, hints and touch hints, and
  the corner lock and count. Set aside: the legend and the rest of the page; the body does not
  scroll.
- The map unlocks on entering (with the page set aside, wheel and drag should move the map) and
  gets its earlier lock back on leaving.
