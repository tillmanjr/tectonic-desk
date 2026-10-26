# Aurora: hemispheric power row and scrub playback

Two items from the aurora oval's backlog. The hemispheric power that OVATION Prime estimates
with every frame becomes a row of the Space page's stack, and the aurora scrub gains a Play
button that steps through the stored frames. A marker on the stack ties the two together while
a past frame is on show.

## Decisions

| Question                           | Decision                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the power comes from         | Two new series in `space_samples`, written by the fast job from the hemispheric power file it already reads for the frame match. No migration.                        |
| Which instant a power row plots at | The forecast time: when the power applies at the oval, aligned with Kp and Dst.                                                                                       |
| Where the row sits                 | After Dst, so the three ground responses read together above the solar wind drivers.                                                                                  |
| Playback                           | One Play button, from the slider's frame (or the oldest when following live) to the newest, every sixth frame (30 minutes), 200 ms a step; about 30 s for three days. |
| Link to the stack                  | A dashed marker across the stack at the frame's forecast time while a past frame is on show and that time lies in the window.                                         |
| Credits                            | Unchanged: OVATION Prime is already credited in the footer and the README table.                                                                                      |

## 1. Server: two series

`packages/shared/src/space.ts` adds `hp_north` and `hp_south` to `SPACE_SERIES` (hemispheric
power, GW, from the OVATION run) and to `seriesRecord`.

`apps/server/src/space/parse.ts` adds `hemiPowerSamples(rows: HemiPowerRow[]): SpaceSample[]`:
two samples per row, `series` `hp_north` and `hp_south`, `time` the row's forecast time, `source`
`"ovation"`, `value` the GW. Rows are the output of `parseHemiPower`, so every sample is finite.

`syncAurora` in `apps/server/src/ingest/space.ts` keeps its shape: fetch the frame, try the power
file (a failure warns and leaves the pair null), insert the frame, prune. After the frame it
upserts `hemiPowerSamples(power)`; with no rows nothing is written. The part still reports the
number of frames inserted. `downsampleBefore`, the window read, the latest readings and the
routes are generic over the series list and need no change.

Tests: `parse.test.ts` checks the samples from the fixture rows (the fixture holds three
parseable rows, so six samples at the three forecast times); the job test's latest readings
include `hp_north` at `2026-10-25T13:30:00Z` with value 20 and `hp_south` 19; the routes test
sees the two series in a window answer.

## 2. Web: the stack row

`RowId` gains `"power"`. `ROWS` in `apps/web/src/lib/space-chart.ts` inserts after `dst`:

```ts
{
  id: "power",
  label: "Hemispheric power N · S",
  unit: "GW",
  series: ["hp_north", "hp_south"],
  right: null,
  scale: "linear",
  domain: (v) => spanAtLeast(v, 0, 40),
  refs: [],
  ticks: null,
  tickLabel: null,
}
```

`CADENCE_MS` gives both 300 000 ms. `SpaceStack`'s `SHORT` labels are `N` and `S`. The
stack's height follows `ROWS.length`, so it grows by one row and the readout gains the pair.
Styles: `.srow .sline.hp_north` in a new `--sw-hp` tone and `.sline.hp_south` thinner in
`--sw-hp-south`, light and dark.

Tests: `space-chart.test.ts` expects the seven ids in order and the power domain;
`SpaceStack.test.ts` and `SpacePage.test.ts` expect seven rows; `test/support/space.ts` gives
the window fixture a few points of each series and the now fixture a reading.

## 3. Web: playback

`AuroraStore` gains `playing: Ref<boolean>`, `play(): void` and `pause(): void`.

- `PLAY_STRIDE = 6` frames, `PLAY_STEP_MS = 200`.
- `play()` does nothing with fewer than two frames. It sets `playing`, takes the start index
  (the frame on show when a frame is selected, else 0 when following live) and schedules the
  first step at once.
- A step moves to `min(i + PLAY_STRIDE, last)`. At `last` it selects null (following) and clears
  `playing`. Otherwise it selects that frame's observed time, waits for its grid (the `show`
  run), starts fetching the frame after it (`PLAY_STRIDE` on, if any) into the cache without
  selecting, and schedules the next step `PLAY_STEP_MS` after the grid arrived.
- `pause()` clears `playing` and the pending step timer. `select()` called from outside while
  playing pauses first, so a scrub stops the run. `stop()` and a hidden document pause.
- `GRID_CACHE` rises from 48 to 160.

`SpaceAurora.vue` adds a button in `.scrub` after Latest: `Play`, or `Pause` while playing,
`aria-pressed` while playing, disabled with fewer than two frames; the slider's `:value` already
follows the frame on show.

Tests with fake timers in `aurora.test.ts`: the stride and the end returning to live; play from
live starting at the oldest; a scrub pausing; the prefetch call order; `stop()` pausing.
`SpaceAurora.test.ts` clicks Play and sees Pause, `playing` true, then clicks again.

## 4. Web: the marker

`SpaceStack` injects `AURORA`. `marker` is a computed x: null while `aurora.selected` is null or
there is no frame; else `x(Date.parse(frame.forecast))` when that instant lies within the
window's `[from, to]`, else null. The template draws `<line class="aumark">` from `M.t` to
`H - M.b` at that x under the cross-hair group. Style: dashed, in the aurora 70 % tone.

Test: `SpaceStack.test.ts` sets `ctx.aurora.selected` and `frame` to a fixture frame inside the
window and finds the line; selecting null removes it; a frame outside the window draws none.

## 5. Docs

README: the ingest paragraph names the two series, the Space page bullet gains the row and
Play, the aurora bullet mentions the marker. CLAUDE.md's space weather bullet: the series, the
store's `play`/`pause`, the stack's marker and seven rows.

## Out of scope

The world-map aurora toggle, long history, imagery, a playback speed control, a loop.
