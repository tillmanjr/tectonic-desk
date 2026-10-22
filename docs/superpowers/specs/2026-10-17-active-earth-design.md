# Active Earth: combined earthquakes and volcanoes page

Date: 2026-10-17. Sub-project: Front end. Status: approved, one PR with four commits.

## Why

Correlating an event on the Earthquakes page with activity on the Volcanoes page means flipping
between them. Active Earth is a third page that shows both datasets on one map with both sets of
cards, refinement bars, tables and charts. The single pages stay as they are, apart from two
improvements that the combined page needs and that read well on their own: refinement bars with a
collapsed informational state, and a per-dataset "hide markers" toggle. A small fix to the volcano
panel's nearby-earthquake offsets rides along.

## Decisions

| Topic            | Decision                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shape            | A third page composed from the existing sections (option 1 of the brainstorm). No rewrite of the two pages into a data-driven one; no overlay toggles instead of a page.                                                       |
| Route            | `/active/:region?`, `meta.page = "active"`, `Page` gains `"active"`, `pageBase("active") = "/active"`. The page switch gains an `Active Earth` button after Volcanoes.                                                         |
| Selection        | One at a time on every page: selecting an event drops `?volcano` from the query, selecting a volcano drops `?event`. One side panel is open at a time.                                                                         |
| Correlation      | None beyond seeing both datasets together and the existing nearby-earthquake list in the volcano panel. Pin and Probe (pin one selection, probe the other dataset) is the follow-on enhancement.                               |
| Hide markers     | In-memory refs on the two stores (`catalog.hideMarkers`, `volcanoes.hideMarkers`), default false, not in the URL or settings. They remove that dataset's markers from the map and change nothing else.                         |
| Settings         | `src/lib/settings.ts`, persisted in `localStorage` under `tectonic.settings`, validated field by field. First setting: `cardRows: { alone: 3, combined: 1 }`. No editing UI yet.                                               |
| Card rows        | Card grids clip to the configured rows in CSS; a `… N more` button after the section label expands them. Expansion resets on a region change and on a page change.                                                             |
| Offsets          | The volcano panel's nearby earthquakes are dated relative to the volcano's most recent eruption (continuing first, else latest start), in the two largest non-zero units, with the precision GVP gives the start date.         |
| Map layer order  | Density shading, then volcano triangles, then earthquake markers on top.                                                                                                                                                       |
| Shared map logic | `useQuakeLayer` and `useVolcanoLayer` composables carry the hover, count-line, density and animation logic so `QuakeMap`, `VolcanoMap` and the new `CombinedMap` share one implementation. `AnimationBar.vue` holds the strip. |

## 1. Nearby-earthquake offsets (`format.ts`, `volcanoes.ts`, `NearbyQuakes.vue`)

- `offsetParts(from: Date, to: Date): { years, months, days, hours, minutes }` in `format.ts`
  computes the calendar difference in UTC: years and months from the year and month fields
  (borrowing when the day of `to` is before the day of `from`), then whole days, hours and minutes
  from the remainder. `offsetText(from, to, precision: "day" | "month" | "year"): string` renders
  the two largest non-zero units of that difference, in order, as `2 y 4 mo`, `1 mo 9 d`,
  `3 d 5 h`, `5 h 12 min`, `40 min`. With precision `month` only years and months are used and a
  difference under a month reads `< 1 mo`; with precision `year` only years, and under a year
  `< 1 y`. The sign is left to the caller; the function takes the absolute difference.
- `eruptionAnchor(eruptions: Eruption[]): EruptionAnchor | null` in `volcanoes.ts`, where
  `EruptionAnchor = { date: Date; precision: "day" | "month" | "year"; continuing: boolean; label: string }`.
  It takes the continuing eruption with the latest start, else the eruption with the latest start,
  ignoring eruptions whose `startYear` is 0 or negative. `date` is `Date.UTC(year, month - 1, day)`
  with a missing day as 1 and a missing month as January; `precision` says which was present;
  `label` is `eruptionStart(e)`.
- `NearbyQuakes.vue` computes the anchor from `store.eruptionsFor(volcano.number)`. With an
  anchor it adds a caption line under the heading,
  `Relative to the eruption that began 2021-09-19, continuing` (or `… began about 1980` when the
  precision is coarser than a day), and each quake line ends `· 1 mo 9 d after onset` or
  `· 3 d 5 h before onset`; a quake inside the onset granule (same UTC day, month or year by
  precision) reads `· in the onset day` / `month` / `year`. Without an anchor the line keeps today's
  `· 5.6 d ago`.

## 2. Settings and card rows (`settings.ts`, `CardGrid.vue`, `MajorEvents.vue`, `VolcanoCards.vue`)

- `Settings = { cardRows: { alone: number; combined: number } }`, `DEFAULT_SETTINGS` as above.
  `createSettings(storage: StorageLike | null = localStorage): SettingsStore` with
  `value: Readonly<Ref<Settings>>` and `set(next: Settings)`, which writes the JSON and swallows
  storage errors (as `theme.ts` does). `parseSettings(raw: string | null): Settings` accepts only
  positive integers up to 20 for each row count and falls back per field. Provided under a
  `SETTINGS` key in `keys.ts`; `App.vue` creates it (or takes an injected one, like the clock);
  `makeContext` supplies `createSettings(null)`.
- `CardGrid.vue` wraps a card section: props `label: string`, `count: number`,
  `rows: number | null`. It renders `<p class="sectionlabel">` with the label and, when cards are
  hidden, a `… N more` button (`class="more"`, `aria-expanded`), then
  `<section class="major" :class="{ clipped }" :style="{ '--rows': rows }">` around its default
  slot. Hidden cards are `max(0, count - rows * columns)` where `columns` is measured from the
  section's computed `grid-template-columns` on mount and on window resize (1 when it cannot be
  read, which is the test environment). `clipped` is `rows !== null && !expanded`. `expanded`
  resets when the injected catalog's region id changes.
- CSS: `.major.clipped { grid-template-rows: repeat(var(--rows), auto); grid-auto-rows: 0; overflow: hidden; }`
  and `.sectionlabel .more` styled as a small text button in the muted colour.
- `MajorEvents` and `VolcanoCards` render their own `CardGrid` with their label (`majorLabel`
  and `Elevated or changed in the last 7 days`) and a `rows` prop; the pages stop rendering the
  label themselves. Earthquakes and Volcanoes pass `settings.cardRows.alone`; Active Earth passes
  `settings.cardRows.combined`. A null `rows` means no clipping (kept for tests and future use).

## 3. Refinement bars (`RefineBar.vue`, `FilterBar.vue`, `VolcanoFilterBar.vue`)

- `RefineBar.vue`: props `dataset: "earthquakes" | "volcanoes"`, `parts: SummaryPart[]`
  (`{ text: string; set: boolean }`), `hidden: boolean`; emits `update:hidden`; slots `default`
  (the inputs) and `note` (rendered under the line in both states). State `expanded = ref(false)`.
- Collapsed: `<section class="filters refine" :class="dataset">` with the title
  `Refine <span class="rwho">earthquakes</span>`, the summary parts separated by `·` with set
  parts in the ink colour (`class="set"`) and unset parts muted, then a small-caps `edit` button
  (`class="rtoggle"`, `aria-expanded`, `aria-controls`) and at the right end a
  `<label class="rhide"><input type="checkbox"> Hide markers</label>`. Expanded: the button reads
  `done` and the default slot replaces the summary on the lines below. Enter and Space toggle
  because it is a real button; the checkbox stays outside it.
- The bar's left border takes the dataset accent: `var(--accent)` for earthquakes and
  `var(--vc-recent)` for volcanoes. The dataset word is muted so `Refine` stays the title.
- `FilterBar` parts: magnitude (`M4.5+`, or `M4.5 to M6`; set when either bound is in the
  filter), window (`90 days from 2026-07-19 to 2026-10-17`, or `custom from … to …`; set when
  either date is in the filter), depth (`depth 10–200 km`, `depth from 10 km`, `depth to 200 km`
  or `depth any`; set when either bound is set). The raised-floor note goes in the `note` slot.
  The existing `Reset` button stays in the expanded body. The `i` tooltip moves next to the hide
  label.
- `VolcanoFilterBar` parts: `setting any|<label>`, `type any|<label>`,
  `last eruption any|<label>`, `status any|<label>`.
- `catalog.hideMarkers` and `volcanoes.hideMarkers` are `Ref<boolean>` on the stores, bound to
  the checkbox. `QuakeMap`, `VolcanoMap` and `CombinedMap` skip the corresponding marker
  component when set. Counts, tables, charts, cards, density shading and the legend are unaffected.

## 4. Active Earth page (`router.ts`, `PageSwitch.vue`, `App.vue`, `ActiveEarthPage.vue`, `CombinedMap.vue`)

- Router: `{ path: "/active/:region?", component: App, meta: { page: "active" } }` ahead of
  `/:region?`. `Page = "earthquakes" | "volcanoes" | "active"`; `pageBase` returns `/active`;
  `pagePath` is unchanged. `hasVolcanoes(page)` in `router.ts` is true for `volcanoes` and
  `active`; `App.vue` uses it to load the volcano store on boot and page change, to refresh its
  live state on a feed change, and to render `VolcanoDetail`.
- `App.vue` `select(id)` also deletes `volcano` from the query and `selectVolcano(n)` deletes
  `event`, on every page.
- `ActiveEarthPage.vue`, top to bottom: the volcano error banner (as on Volcanoes), `StatsStrip`,
  `VolcanoTiles`, `MajorEvents :rows="combined"`, `VolcanoCards :rows="combined"`, `FilterBar`,
  `VolcanoFilterBar`, `CombinedMap`, `<p class="sectionlabel">Earthquakes</p>` with the
  earthquake `grid2` (table, time, frequency, depth charts), `<p class="sectionlabel">Volcanoes</p>`
  with the volcano `grid2` (table, decade, VEI charts).
- Composables in `src/lib/layers.ts`:
  - `useQuakeLayer({ catalog, clock, zone, mv })` returns `showMech`, `showDensity`, `density`,
    `densityLegend`, `anim`, `shown`, `countLine`, `openAnimation`, `togglePlay`, `onHover`,
    and closes the animation on unmount. This is today's `QuakeMap` script.
  - `useVolcanoLayer({ store, mv })` returns `countLine`, `ringOf`, `onHover`, and zooms to a
    newly selected volcano. This is today's `VolcanoMap` script.
  - `AnimationBar.vue` takes `anim`, `shownCount`, `total` and renders the strip now inlined in
    `QuakeMap`. `VolcanoLegendRows.vue` holds the volcano legend rows now inlined in `VolcanoMap`.
  - `QuakeMap` and `VolcanoMap` are rewritten on these pieces with no behaviour change.
- `CombinedMap.vue`: one `useMapView`, both composables. `MapShell` label
  `Map of earthquake epicenters and Holocene volcanoes`, `quakes` true, `density` and `floor` from
  the quake layer, count line `${quake.countLine} · ${volcano.countLine without "Showing "}`,
  which reads `Showing 562 of 2,044 events · markers at M5+ · 38 of 41 volcanoes`. Tools: Density
  (when offered) and Focal mechanisms. Actions: Animate. Bar: `AnimationBar`. Layers in order:
  `MapDensity`, `MapVolcanoes` (unless `volcanoes.hideMarkers`), `MapEvents` (unless
  `catalog.hideMarkers`), with `shown` from the animation. Legend slot: `VolcanoLegendRows`.
  Both hover handlers call the shared tip; the volcano selection zooms as on Volcanoes.

## 5. Errors and edge cases

- Volcano store errors show in the banner above the volcano tiles with Retry, as on Volcanoes;
  earthquake errors keep their banner at the top. Either failing leaves the other working.
- A raised floor on a long window behaves exactly as on Earthquakes, note included; the volcano
  half ignores it.
- Deep links `/wc`, `/volcanoes/wc` and their queries are unchanged. Unknown paths redirect to `/`.
- Settings that are missing, malformed or out of range fall back per field; storage that throws
  on read or write is ignored.
- On a narrow screen both bars start collapsed, so the page opens with two one-line summaries.

## 6. Testing

- `format.test.ts`: `offsetParts` borrowing, `offsetText` unit pairs and precision rules.
- `volcanoes.test.ts`: `eruptionAnchor` picks continuing over latest, latest otherwise,
  precision from the fields, ignores BCE, null when nothing qualifies.
- `settings.test.ts`: defaults, parsing of good and bad JSON, range check, storage that throws.
- `router.test.ts`: `/active/wc`, `pageBase("active")`, `hasVolcanoes`.
- `CardGrid.test.ts`: clipping class and style, hidden count with a stubbed column count, more
  button and reset on region change. `MajorEvents` and `VolcanoPanels` tests updated for the label
  moving inside.
- `RefineBar.test.ts`: collapsed summary classes, toggle by click and keyboard, hide emits.
  `FilterBar.test.ts` and `VolcanoFilterBar` tests: parts text for set and unset filters.
- `NearbyQuakes` (new test file): before, after, in-granule and fallback wording.
- `layers.test.ts` through the maps: `QuakeMap` and `VolcanoMap` tests unchanged in intent;
  `CombinedMap.test.ts`: layer order, count line, both hide toggles, animation filtering both
  layers, both tips.
- `ActiveEarthPage.test.ts`: section order; `App.test.ts`: `/active/wc` boots with both stores,
  switch button, one-selection rule, volcano refresh on feed change.
- Coverage stays at 100% on `apps/web/src`; lint, typecheck, Prettier and build clean; Chrome
  pass on West Coast and Global.

## 7. Documentation

README Front end: the Active Earth page, the refine bars' two states and hide toggle, card rows
and the settings key, the eruption-relative offsets. CLAUDE.md Front end: the `active` page,
`SETTINGS`, `RefineBar`, `CardGrid`, `layers.ts`, `hideMarkers`.

## Out of scope

Pin and Probe; a settings editor; correlation panels across the two datasets; changes to the
single pages beyond the refine bars, hide toggles and card rows.

## Addendum 2026-10-22: toggling without buttons

The `edit`/`done` button is gone. The bar's first line is a `div.rhead` with `role="button"`,
`tabindex="0"`, `aria-expanded` and `aria-controls`. Collapsed, a click anywhere on the bar other
than the `Hide markers` checkbox (and other interactive elements) expands it; expanded, only a click
on the head line folds it, so the inputs below are safe to use. Enter and Space on the head toggle
as well.
