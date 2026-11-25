# Theater mode event details

Date: 2026-11-25. Status: built (branch `theater-details`, stacked on `auto-zoom`).

## Why

Theater mode gives the map the whole window, and the map is where events are explored in or out of it.
A selection in theater mode opened its side panel under the theater, out of sight, so reading an event
meant leaving theater mode.

## Decisions

- A setting, **Theater mode event details**, On (the default) or Off, in the ⚙ menu after Auto-zoom
  event, kept in `tectonic.settings` as `theaterDetails`.
- On: the earthquake and volcano side panels slide in over the theater-mode map as they do over the
  page. Escape closes the panel first; the next Escape leaves theater mode.
- Off: the theater shows the map alone, as before; a selection's panel waits until the reader leaves.
- The Settings deep dive gains a step for it.

## As built

- `src/lib/theater.ts`: `IN_THEATER` (the body's class, set by `toggleTheater` in `mapview.ts` and
  removed on unmount), `THEATER_DETAILS` (the root's class, set by `App.vue` from the setting) and
  `panelsOverTheater()`.
- `styles.css`: `.theater-details body.in-theater .detail` raises the panels (z-index 36) above the
  theater card (35).
- `DetailPanel` calls `preventDefault` on the Escape it uses while `panelsOverTheater()`, and the map's
  `onEscape` ignores an Escape already taken. The volcano panel has no Escape of its own.
