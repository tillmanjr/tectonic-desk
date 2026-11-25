# Auto-zoom event

Date: 2026-11-25. Status: built (branch `auto-zoom`).

## Why

Selecting an earthquake or a volcano pans and zooms the map to it, at a fixed zoom (3, or 6 on a global
frame). Usually that helps. Sometimes it undoes the view the reader built: zoomed in past that level on
Iceland's volcanoes, picking one pulled the map out and recentred it.

## Decisions

- A setting, **Auto-zoom event**, On (the default, today's behaviour) or Off, in the ⚙ menu after
  Beachball, kept in `tectonic.settings` as `autoZoom`.
- Off: a selection still opens or updates the side panel and lights the marker; the map's zoom and pan
  stay where they are. It applies to every way of selecting (map, tables, cards, marks, links) on the
  Earthquakes, Volcanoes and Active Earth maps.
- The setting is read when the selection changes, so turning it on later does not move the map until the
  next selection.
- The Settings deep dive gains an Auto-zoom step.

## As built

- `autoZoom` in `src/lib/settings.ts`; `useQuakeLayer` and `useVolcanoLayer` in `src/lib/layers.ts`
  inject `SETTINGS` and call `mv.zoomTo` only when it is on. Tours that frame a section with `mv.zoomTo`
  directly are unaffected.
- `SettingsMenu.vue` row (`data-tour="settings.autozoom"`), the `autozoom` step in `src/lib/deep/settings.ts`.
- The settings menu is 30% wider (min 286 px, never wider than the screen less its gutters) and its labels
  never wrap.
