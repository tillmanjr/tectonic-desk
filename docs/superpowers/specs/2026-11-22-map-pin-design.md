# Map pin

The reader can drop one pin on each map view (Global, West Coast), name it, and move it. Pins and
the 24 most recent placements persist in this browser.

## Decisions

- Store: `src/lib/pins.ts` (`createPins`, `PINS` key, `localStorage` `tectonic.pins`,
  `createPins(null, now)` in tests). The document is `{ current: { global, wc }, history }`; a pin is
  `{ id, view, lon, lat, name, placed }` with full-precision float degrees. Placing replaces the
  view's pin and adds a history entry (newest first, capped at `PIN_HISTORY` = 24); moving and
  renaming update the pin and its entry; removing keeps the entry. Malformed stored pins are dropped
  one by one.
- The view is `viewOf(frame.global)`, the split the field rasters use, so all three map pages share
  the view's pin.
- Tool: `src/lib/pin-tool.ts` (`usePinTool`), created in `useMapView` beside the section tool.
  Arming one tool stands the other down; Escape cancels either; a region change cancels a placement.
- Placing: the `Pin` button opens `PinBar.vue` under the toolbar (armed when the view has no pin).
  While armed the map shows a crosshair, a ghost pin under the pointer and a readout beside it
  (`lat, lon · click to place`); the bar shows the same coordinates. A click that ends a pan is not
  a placement.
- Moving must be deliberate: a press on the pin has to hold still for `PIN_HOLD_MS` (450 ms, within
  `PIN_SLOP_PX` 4 px) before the pin lifts and follows the pointer, reading out its coordinates until
  release. A quick press or a drag opens the bar and never moves the pin. The press is kept off
  d3-zoom (`pointerdown.prevent`, `touchstart.stop.prevent`), as the section handles are.
- Hover shows `name · lat, lon`. Coordinates are latitude then longitude, signed decimal degrees to
  four places (`fmtLatLon`).
- Graphic: a teardrop standing on its point with a ground shadow, in its own magenta (`--pin`,
  `--pin-edge`, `--pin-core`), constant screen size; nothing else on the map uses that shape or
  colour. It draws above the section line.
- The bar: coordinates, name (80 characters), Re-place, Remove, close, and a Recent list of both
  views' placements (date, name, coordinates, view).
