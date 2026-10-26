# Aurora layer on the world maps

Space weather sub-project 2b. The aurora oval the Space page draws on its polar maps becomes a
toggle on every map: the OVATION Prime probability bands and the night side at the frame's
forecast time, over the basemap, under the plates and markers.

## Decisions

| Question       | Decision                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which frame    | The frame the aurora store has on show: the newest unless the Space page scrubbed or paused a replay, so the two views agree.                         |
| Night side     | Shaded with the layer, at the frame's forecast time, under the bands. Not a separate toggle.                                                          |
| Which maps     | Every `MapShell`: Active Earth, Earthquakes, Volcanoes; global and West Coast frames.                                                                 |
| Data           | Nothing new: the store's `bands`, `nightRing` and `subsolarPoint` from the aurora work.                                                               |
| Store lifetime | The map starts the aurora store while its toggle is on and stops it when the toggle goes off or the map unmounts; the Space page keeps its own start. |
| Credits        | Unchanged: OVATION Prime is already credited.                                                                                                         |

## 1. `useMapView`

`MapView` gains `showAurora: Ref<boolean>`, default false, beside `showPlates` and `showTeeth`.
Nothing else in the view changes: the layer draws through `view.path` like the plates.

## 2. `MapAurora.vue`

Props: `path: GeoPath`, `bands: AuroraBand[]`, `forecast: string`. It computes the subsolar
point from the forecast, the night ring through `nightRing`, and one path per band through
the given `path`. Template: `<g class="aurora" style="pointer-events: none">` holding
`<path class="night">` then `<path class="band au-NN">` per band, weakest first, keyed by
level. The `.au-NN` fills and the night tone come from the existing `.polar` rules, extended
so `.aurora .band.au-NN` and `.aurora .night` share them. The night fill uses `--au-night`.

The layer sits in `MapShell` after `MapField` and before `MapFaults`, rendered when
`mv.showAurora` is on and the store has a frame:

```vue
<MapAurora
  v-if="mv.showAurora.value && aurora.frame.value !== null"
  :path="mv.view.value.path"
  :bands="aurora.bands.value"
  :forecast="aurora.frame.value.forecast"
/>
```

## 3. `MapShell`

Injects `AURORA` and `ZONE`. A watcher on `mv.showAurora` calls `aurora.start()` when it goes
on and `aurora.stop()` when it goes off; `onBeforeUnmount` calls `stop()` when the toggle is on.
The toolbar gets `<label><input v-model="mv.showAurora.value" type="checkbox" /> Aurora</label>`
after `Subduction teeth`.

The legend gets a new prop `aurora: AuroraLegend | null` (null when the toggle is off):

```ts
export interface AuroraLegend {
  /** The frame's forecast time as shown, or null while the first frame loads. */
  forecast: string | null;
  error: string | null;
}
```

`MapLegend` renders, when `aurora !== null`, one `.sw.aurorarow`: the five `au-NN` swatches with
their percentages and "chance of aurora", then "at HH:MM UTC" (`fmtClock` in the zone), or
"loading" while `forecast` is null, or the error text when `error` is set. `MapShell` builds
it from the store: `forecast` is `aurora.frame.value?.forecast ?? null`, `error` is
`aurora.error.value`.

## 4. Tests

- `test/lib/mapview.test.ts` or the existing view tests: `showAurora` starts false.
- `test/components/MapAurora.test.ts`: with `ringGrid()` bands through the global frame's path,
  five band paths in level order and a night path, all non-empty; zero bands draws only the
  night.
- `test/components/QuakeMap.test.ts` (the shell's host): the toggle starts the store
  (`api.auroraIndex` called), the `.aurora` group appears once a frame is in, the legend row
  shows the forecast time, unticking stops it (`document` listener removed, no further polls),
  unmount with the toggle on stops it.
- `test/components/MapLegend.test.ts`: the row with a time, with loading, with an error, and
  absent when null.

## 5. Docs

README: the aurora bullet gains the map toggle; the map toolbar sentence lists `Aurora`.
CLAUDE.md: `MapShell` owns the aurora layer and starts the store for it; `MapAurora.vue`.

## Out of scope

A time control on the map (the Space page scrubs), long history, imagery.
