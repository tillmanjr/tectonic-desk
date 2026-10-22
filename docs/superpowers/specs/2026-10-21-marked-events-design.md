# Marked events: keeping a place while chasing an idea

Date: 2026-10-21. Sub-project: Front end. Status: approved, one PR with a commit per task.

## Why

A reader looking at an event in a side panel is reminded of another, or has an idea that means
looking elsewhere on the desk. The URLs are informative, but moving away still loses the view.
Marked events let the reader name the view they are in, keep as many as they like across both
datasets, gather them into groups, and later reopen any one of them or lay a whole group's panels
out at once. Everything is kept in the browser; nothing reaches the server.

## Decisions

| Topic         | Decision                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is kept  | The view as it was: page, region, window, filters and the selection, as the route's path and query. Opening a mark navigates there. "Open the event here" without the saved view is a follow-up, not built now.                                                                                 |
| Terms         | The button says `Mark`, the header entry `Marks`, the overlay `Marked events`, collections `Groups`. All labels live in one `MARK_TERMS` table in `src/lib/marks.ts` so a better word is a one-line change.                                                                                     |
| Storage       | `localStorage` key `tectonic.marks`, parsed field by field like `tectonic.settings`; malformed entries are dropped, not fatal. In memory when storage is unavailable.                                                                                                                           |
| Groups        | Stored groups are named lists of mark ids. `All` is virtual: every mark, cannot be renamed, emptied or deleted. A mark may be in any number of stored groups; deleting the mark removes it from all of them.                                                                                    |
| Duplicates    | Marking the same event twice is allowed: a mark records a view, not just an event. The button's star is filled when the open event has at least one mark.                                                                                                                                       |
| Host          | A full-screen overlay over the current view, addressed by `?marks=<groupId>` and `?marks=<groupId>&show=panels` (option 1 of the brainstorm). The page underneath stays mounted and loaded; Escape, the close control and the back button return to it. Not a fourth page, not a second drawer. |
| Show events   | The group's marks stacked, each a card with the thumbnail, the name, `Open view` and the full panel body. The side panels split into header and body so the bodies can be reused.                                                                                                               |
| Thumbnails    | Each mark row and card shows a 96 by 56 schematic: land outline and a star at the event. The West Coast preset gets the regional outline, anything else the world. Outline data comes from the same cached loaders the map uses.                                                                |
| Confirmation  | Deleting a mark or a group asks inline (`Delete? yes · no`). No browser dialogs anywhere.                                                                                                                                                                                                       |
| Router access | Components still never touch the router. `App.vue` provides a `MarksNav` object (current view url, open, show, close, go to) under a `MARKS_NAV` key, beside the `MARKS` store.                                                                                                                 |

## 1. Store (`src/lib/marks.ts`)

```ts
export type MarkKind = "event" | "volcano";
export type ThumbFrame = "world" | "wc";

export interface Mark {
  id: string; // random, stable; from the injected id function
  kind: MarkKind;
  ref: string; // USGS event id, or the GVP number as a string
  name: string; // the reader's name
  url: string; // path and query of the view as marked, overlay keys removed
  frame: ThumbFrame; // which schematic the thumbnail draws
  lon: number;
  lat: number;
  headline: string; // "M6.9 mww" or "Shishaldin"
  sub: string; // place, or "country · region"
  stamp: string | null; // event origin time (ISO); null for a volcano
  createdAt: string; // ISO
}
export interface MarkGroup {
  id: string;
  name: string;
  marks: string[]; // mark ids, in the order added
}
export type MarkDraft = Omit<Mark, "id" | "createdAt">;
/** What a panel knows about its subject; the button adds `name` and `url`. */
export type MarkSubject = Omit<MarkDraft, "name" | "url">;
/** A group as shown: `All` resolved, members resolved to marks. */
export interface MarkView {
  id: string;
  name: string;
  virtual: boolean;
  marks: Mark[];
}

export const MARKS_KEY = "tectonic.marks";
export const ALL_GROUP = "all";
export const MARK_TERMS = {
  verb: "Mark",
  noun: "Marks",
  title: "Marked events",
  group: "Group",
  groups: "Groups",
  all: "All",
} as const;
export const NAME_MAX = 120;
```

- `parseMarks(raw: string | null): { marks: Mark[]; groups: MarkGroup[] }` accepts the JSON
  `{ v: 1, marks: [...], groups: [...] }`. A mark is kept only when every field has the right type
  (`kind` one of the two, `frame` one of the two, `lon` and `lat` finite numbers, `stamp` a string
  or null, the rest strings); a group only when `id` and `name` are strings and `marks` an array,
  from which ids not naming a kept mark are removed. A group whose id is `all` is dropped. Anything
  else, including unparsable JSON, yields empty lists.
- `createMarks(storage: StorageLike | null = localStorage, deps = { id: randomId, now: () => new Date() }): MarksStore`
  reads once on creation and writes the whole document after every change, swallowing storage
  errors as `settings.ts` does. `randomId()` is eight base-36 characters from `Math.random` plus
  the time in base 36, enough for a browser-local list; tests inject a counter.

```ts
export interface MarksStore {
  /** Newest first. */
  marks: Readonly<Ref<Mark[]>>;
  /** In creation order. */
  groups: Readonly<Ref<MarkGroup[]>>;
  add(draft: MarkDraft): Mark;
  rename(id: string, name: string): void;
  remove(id: string): void;
  addGroup(name: string): MarkGroup;
  renameGroup(id: string, name: string): void;
  removeGroup(id: string): void;
  setMember(markId: string, groupId: string, member: boolean): void;
  /** Moves a mark one place within `all` or a stored group; the ends and unknown ids are no-ops. */
  move(groupId: string, markId: string, delta: -1 | 1): void;
  /** `all` or a stored group, members in the group's own order; null for an unknown id. */
  view(groupId: string): MarkView | null;
  /** How many marks name this subject. */
  countFor(kind: MarkKind, ref: string): number;
  /** The mark's stored groups. */
  groupsOf(markId: string): MarkGroup[];
}
```

- Names are trimmed and cut to `NAME_MAX`; an empty name after trimming is replaced by the mark's
  headline (for a mark) or `Group N` (for a group, N the count plus one). `rename`, `renameGroup`,
  `remove`, `removeGroup` and `setMember` ignore unknown ids. `setMember` with `ALL_GROUP` is a
  no-op. `view(ALL_GROUP)` returns `{ id: "all", name: MARK_TERMS.all, virtual: true, marks }`.
- Displayed name for a subject before the reader edits it (`defaultName(subject)`): for an event
  `headline · sub` (`M6.9 mww · 76 km NE of Ozernovskiy, Russia`), for a volcano the same shape
  (`Shishaldin · United States · Alaska`).

## 2. Keys and the shell (`keys.ts`, `App.vue`, `router.ts`)

- `MARKS: InjectionKey<MarksStore>` and `MARKS_NAV: InjectionKey<MarksNav>` in `keys.ts`.

```ts
export interface MarksNav {
  /** The current route's path and query without `marks` and `show`: what a new mark saves. */
  viewUrl: Readonly<Ref<string>>;
  /** The overlay state the route asks for; null when closed. */
  overlay: Readonly<Ref<{ group: string; panels: boolean } | null>>;
  open(group?: string): void; // push, adds marks=<group> (default all), drops show
  show(group: string): void; // push, marks=<group>&show=panels
  list(group: string): void; // push, marks=<group>, drops show
  close(): void; // replace, drops marks and show
  goTo(url: string): void; // push(url); the url carries no overlay keys, so the overlay closes
}
```

- `App.vue` creates the store with `inject(MARKS, null) ?? createMarks()` (tests inject
  `createMarks(null)`), provides both keys, builds `viewUrl` from `route.path` and the query minus
  the two keys with the router's own `stringifyQuery`, and renders `<MarksOverlay v-if="nav.overlay.value !== null" />`
  after the detail panels. The header's right side gains, before Times, a button
  `Marks · N` (`N` the mark count; just `Marks` at zero) with `aria-haspopup="dialog"` that calls
  `nav.open()`. `router.ts` is unchanged: the overlay keys are query keys on every page.
- `pickRegion` and `pickPage` keep dropping only the selection keys; the overlay's scrim covers
  the header so they cannot fire while it is open.

## 3. Marking from a panel (`MarkButton.vue`, `DetailPanel.vue`, `VolcanoDetail.vue`)

- `MarkButton.vue` takes `subject: MarkSubject | null` and renders a row directly under the
  panel header (`div.markrow`), not inside it, so the name input has the panel's width. Idle, the
  row is one small button: `☆ Mark` (hollow star) or `★ Mark` (filled) when
  `store.countFor(kind, ref) > 0`, with `title` `Marked once` / `Marked N times`. The button is
  disabled while `subject` is null (the panel is loading or the subject is unknown).
- Clicking shows, in the same row, a text input prefilled with `defaultName(subject)` and
  focused with its text selected, plus `Save` and `Cancel`. Enter saves, Escape cancels; both key
  handlers call `stopPropagation` so the panel's document-level Escape does not close it. Saving
  calls `store.add({ ...subject, name, url: nav.viewUrl.value })`, returns the row to idle and
  shows `Marked` beside the star for two seconds (a `savedAt` ref cleared by a timer that unmounts
  cleanly).
- `DetailPanel.vue` derives the subject from `head` (the detail when loaded, else the catalogue
  row): `kind: "event"`, `ref: id`, `headline: M{mag} {magType}` (the panel's existing
  formatting), `sub: placeOf(head)`, `stamp: time`, `lon/lat`, `frame` from the catalogue's current
  region: `"wc"` when `catalog.region.value?.bbox` is not null, else `"world"`.
- `VolcanoDetail.vue` derives it from `v`: `kind: "volcano"`, `ref: String(number)`,
  `headline: name`, `sub: country · region`, `stamp: null`, `lon/lat`, same frame rule from the
  volcano store's region. With `v` null the subject is null.

## 4. Panel bodies (`EventDetailBody.vue`, `VolcanoDetailBody.vue`)

- `EventDetailBody.vue` takes `id: string` and owns everything `DetailPanel.vue` does today below
  the header: the fetch with its token, loading, not-found and error states with `Retry`, the
  `derived` computation, `describe`, and the template from `dl.kv` to the USGS link. It emits
  `loaded` with the detail once fetched (and `null` when a new id starts loading), so the panel
  header can keep `head = detail ?? catalog.selected` for the magnitude type and the mark subject;
  the `Open that event` link keeps calling the injected `SELECT`.
- `DetailPanel.vue` keeps the `aside`, the header, `open`, `close` and the Escape listener, and
  renders `<MarkButton :subject="subject" />` then `<div class="bd"><EventDetailBody v-if="id !== null" :id="id" @loaded="…" /></div>`.
- `VolcanoDetailBody.vue` takes `number: number`, looks the volcano up in `store.byNumber`, and
  owns the status fetch, the eruption strip, the eruption list, `NearbyQuakes` and the
  "not in the Holocene catalogue" note. `VolcanoDetail.vue` keeps the `aside`, header, `open`,
  `close`, renders `MarkButton` and the body.
- Behaviour and markup of both side panels are unchanged apart from the new row; the existing
  tests for them pass as they are.

## 5. The overlay (`MarksOverlay.vue`, `MarkRow.vue`, `MarkPanels.vue`, `ConfirmButton.vue`)

- `MarksOverlay.vue` renders `div.marks-scrim` (click closes) and `section.marks[role=dialog][aria-modal=true][aria-labelledby]`.
  On mount it adds `marks-open` to `document.body` (CSS `overflow: hidden`) and focuses its close
  button; on unmount it removes the class. A document `keydown` listener closes on Escape unless
  the event's target is an input, textarea or button marked `data-keep` (the inline editors handle
  their own Escape). It reads `nav.overlay.value`; a `group` id that `store.view` does not know
  falls back to `all` by calling `nav.list(ALL_GROUP)` in a watcher.
- Layout: a header row (`h2` `Marked events`, the close `×`), then `nav.marks-rail` and `div.marks-main`.
  The rail lists `All · N`, every stored group with its count, and `+ New group`, which turns into
  an input (`Enter` adds via `store.addGroup` and selects it, `Escape` cancels). The active group
  is `aria-current="true"`. Under 720 px the rail becomes a horizontally scrolling row of chips
  above the main area.
- The main area header: the group name, editable in place for stored groups (click the name or
  its `Rename` button, Enter saves, Escape cancels), `Show events` (calls `nav.show(group)`;
  disabled when the group is empty), and for stored groups a `ConfirmButton` labelled
  `Delete group` whose confirm calls `store.removeGroup` and `nav.list(ALL_GROUP)`.
- In list mode the main area is `MarkRow` per mark, newest first. Empty `All` reads
  `Nothing marked yet. Open an event or a volcano and use ☆ Mark under its name.`; an empty
  stored group reads `No marks in this group yet. Add some from the chips on each mark in All.`
- `MarkRow.vue` takes `mark: Mark`: `MarkThumb`, the name as a button that becomes an input
  (`Enter` saves via `store.rename`, `Escape` cancels, blur saves), a facts line
  (`headline · sub` and, for events, `fmtStamp(stamp, zone)`), a `marked 2026-10-21` line, the
  group chips (`button.chip[aria-pressed]` per stored group, click toggles `store.setMember`; the
  row shows `no groups yet` when none exist), `Open view` (calls `nav.goTo(mark.url)`) and a
  `ConfirmButton` `Delete` whose confirm calls `store.remove`.
- `MarkPanels.vue` (show mode) renders `Back to list` (calls `nav.list(group)`) then one
  `article.markcard` per mark: `MarkThumb`, the name, `headline · sub`, `Open view`, and the
  body: `EventDetailBody` for an event, `VolcanoDetailBody` for a volcano. On mount and whenever
  the group changes, if any mark is a volcano and `volcanoes.volcanoes.value.length === 0` it calls
  `volcanoes.load()`. The bodies' window-derived sections (Sequence; Earthquakes within 50 km)
  describe the window loaded under the overlay, as the side panel would. Cards fill columns first:
  `repeat(auto-fill, minmax(min(481px, 100%), 1fr))`, so as many 481 px columns as fit, then rows.
- `ConfirmButton.vue` takes `label: string` and emits `confirm`. Idle it is one button; clicked
  it becomes `Delete? ` with `yes` and `no` buttons, and reverts after `no`, Escape or five seconds.

## 6. Thumbnails (`basemap-cache.ts`, `thumb.ts`, `MarkThumb.vue`)

- `src/lib/basemap-cache.ts` takes over the module-level caches from `mapview.ts`:
  `loadBasemapFor(api: ApiClient, region: ApiRegion): Promise<Basemap>` keyed `world` for a region
  without a bbox and the region id otherwise, sharing one in-flight promise per key, and
  `resetBasemapCache()`, which `resetMapCaches()` calls. `mapview.ts` uses it and keeps no cache
  of its own.
- `src/lib/thumb.ts`: `THUMB = { width: 96, height: 56 }`; `thumbProjection(frame: ThumbFrame, bbox: Bbox | null): GeoProjection`
  (world: Natural Earth rotated to 150 °W fitted to the box with a 2 px inset, like the map; `wc`:
  the same construction `frameFor` uses for a bbox, fitted to the thumb box; a `wc` frame without
  a bbox falls back to the world); `outlinePath(frame, basemap, projection): string` renders the
  land to one path string; `starPath(cx, cy, r): string` is a five-point star.
- `MarkThumb.vue` takes `lon`, `lat`, `frame`. It injects `API` and `CATALOG`, finds the `wc`
  region in `catalog.regions` for its bbox, loads the basemap through `loadBasemapFor` (a module
  map caches the rendered path string per frame, so a second thumbnail draws at once), and renders
  `svg.thumb[viewBox="0 0 96 56"][aria-hidden="true"]` with `path.land`, and `path.star` at the
  projected point (`r = 5`, fill `var(--accent)` for events, `var(--vc-recent)` for volcanoes via a
  `kind` prop, stroke `var(--ink)`). Before the outline arrives, or if it fails, the star draws
  alone over the plain box. A point the projection cannot place (null) draws no star.

## 7. Styles (`styles.css`)

- `.markrow` under `.detail .hd`: 6 px 16 px padding, border-bottom `var(--line)`, the button in
  `var(--f-ui)` 13 px with the star in `var(--accent)` when filled; the input flexes to fill.
- `.marks-scrim` fixed, `rgba(0,0,0,.45)`, z-index 30; `.marks` fixed inset 24 px (0 on narrow
  screens), `var(--panel)` background, border and radius like `.detail`, grid `auto / 220px 1fr`
  with the rail scrolling independently; `.marks-main` scrolls. Rows are a grid
  `96px 1fr auto` with the thumbnail first; cards reuse `.detail .bd` spacing through a shared
  `.panelbody` class the bodies carry.
- `body.marks-open { overflow: hidden }`.

## 8. Tests

- `test/lib/marks.test.ts`: parsing (good document, each malformed field, foreign `all` group,
  membership of unknown ids), add newest first with id and time from the deps, rename trimming and
  empty-name fallback, remove cascading to groups, group add/rename/remove, `setMember` both ways
  and the `all` no-op, `view` for all, a stored group and an unknown id, `countFor`, `groupsOf`,
  storage write after each change and swallowed storage errors, `createMarks(null)`.
- `test/lib/thumb.test.ts`: projection choice per frame and bbox, the star path shape, the
  outline path from a tiny basemap. `test/lib/basemap-cache.test.ts`: one fetch per key, shared
  in-flight promise, reset.
- `test/components/MarkButton.test.ts`: disabled without a subject, prefilled name, Enter saves
  with the nav's url, Escape cancels and does not propagate, filled star and title after saving,
  `Marked` flash cleared by the timer.
- `DetailPanel.test.ts` and `VolcanoDetail.test.ts`: unchanged, plus one assertion each that the
  row renders and saves a mark with the right kind, ref and frame.
- `test/components/MarksOverlay.test.ts`: rail counts, empty copy, rename mark, delete with
  confirm and `no`, group create, rename, delete returning to All, membership chips, `Open view`
  calls `goTo`, unknown group falls back to All, Escape and scrim close, body class on mount and
  unmount, show mode renders one body per mark, triggers the volcano load once, and
  `Back to list`. `ConfirmButton.test.ts` for the revert paths.
- `test/components/MarkThumb.test.ts`: world and `wc` outline choice, star placement, no star
  for an unprojectable point, star alone while the basemap is pending.
- `App.test.ts`: `?marks=all` renders the overlay over a loaded page, the header button opens
  it, close removes the keys, `viewUrl` excludes them, and `goTo` navigates. `mount.ts` adds
  `marks: createMarks(null)` and a `nav` with `vi.fn()` members to the context.
- Coverage stays at 100 % on `apps/web/src`.

## 9. Docs

- README front-end bullets: one on marking and the overlay (what is stored, where, that nothing
  leaves the browser), one on Show events and thumbnails.
- CLAUDE.md front-end section: a `Marks` bullet naming `marks.ts`, the two keys, the overlay
  route keys, the body split and `basemap-cache.ts`.

## Out of scope, recorded for later

Opening a mark's event in the current view instead of the saved one; export and import of the
marks document; reordering groups; Pin and Probe.

## Addendum 2026-10-22: order

Order is meaningful everywhere. `All` lists the marks array as stored (new marks first), a stored
group lists its `marks` array (members in the order assigned), and Show events follows the same
order. Each row and card carries `▲ ▼` buttons (disabled at the ends) that call
`store.move(groupId, markId, ±1)`; the move is persisted, so it survives reloads. Moving within a
group never changes `All`, and the reverse.

## Addendum 2026-10-22: Compare

A third view per group, `?marks=<group>&show=matrix`, from a `Compare` button beside
`Show events` (disabled below two marks). Designed against an HTML mockup the user approved.

- **Staircase.** Columns are all marks but the last, rows all but the first, in group order; a card
  exists where the row mark comes later in the group than the column mark. The left column holds
  n − 1 cards and each column to the right one fewer; no self pair, no empty row or column.
- **Nodes.** Each header is a rounded node: name with the kind glyph (square for an earthquake,
  triangle for a volcano), then one line each for origin time, magnitude and depth, or the
  eruption onset at GVP's precision, or `no dated eruption`.
- **Edges.** A vertical spine runs from each top node, through an arrowhead under it, down its
  column (dotted where it passes empty positions); each card hangs off a horizontal rung from its
  row node. Top nodes are centred over their columns, row nodes and cards vertically centred.
- **Cards.** A three-column chart read from the left node to the top node. Headers: blank, a drawn
  arrow curving back to the left node, `Δ` with the two small arrows, a drawn arrow pointing up to
  the top node. Rows: `time`, `M`, `depth`, each as left value, change, top value; the change is
  top minus left (`+1 d 6 h`, `−4 h 32 min`, `same time`; `+0.6`; `−68 km`), `—` where a side has
  no value. Footer: `1,150 km apart`. Cells are centred both ways.
- **Store.** Marks carry `mag` and `depthKm`; marks saved earlier get the magnitude parsed from
  the headline and a null depth.
- **Width warning.** The Compare tooltip estimates `ROW_HEADER_PX + (n − 1) × COL_PX` against the
  main area's measured width and says the grid will scroll sideways when it will not fit;
  remeasured on window resize.

The pure pieces live in `src/lib/matrix.ts` (`pointOf`, `signedOffset`, `nodeLines`, `cardOf`,
`staircase`, `compareTitle`); the arrows are `MatrixArrow.vue`.
