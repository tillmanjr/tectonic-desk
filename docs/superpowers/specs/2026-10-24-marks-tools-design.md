# Marks tools: open here, group order, export and import

Date: 2026-10-24. Sub-project: Front end. Status: approved, one PR with a commit per task.

## Why

Marked events (spec `2026-10-21-marked-events-design.md`) left four items for later. Three of them
are built here: opening a mark's subject in the view the reader is in rather than the saved one,
ordering the groups in the rail, and moving the whole marks document between browsers. The
fourth, Pin and Probe, stays parked.

## Decisions

| Topic         | Decision                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open here     | A second button beside `Open view` on each mark row and each Show events card. It keeps the current page, region, window and filters and selects the mark's subject. The map does not move; when the event lies outside the loaded window the panel still opens, since the panel fetches by id. |
| Page mismatch | When the current page lacks the panel for the mark's kind (an event on the Volcanoes page, a volcano on the Earthquakes page) the path becomes Active Earth with the same region and query, and a notice says `Switching to Active Earth`. Otherwise the page is kept.                          |
| Notice        | One app-level strip (`role="status"`) at the bottom of the viewport, fed by a tiny store any component can post to. Posting replaces the text and restarts the timer. Only the Marks nav uses it in this change.                                                                                |
| Group order   | Stored groups carry the order of the `groups` array. The overlay's group head gets ▲▼ for a stored group, mirroring the mark rows. `All` stays first and has no arrows.                                                                                                                         |
| Export        | A JSON file of the whole document, `{ v: 1, exportedAt, marks, groups }`, downloaded as `tectonic-marks-<yyyy-mm-dd>.json`. Never a single group: the document is the unit of backup.                                                                                                           |
| Import        | Reads one such file through `parseMarks`, so malformed entries drop as they do for a corrupt `localStorage`. The reader then chooses `Merge` (add what is missing, delete nothing) or `Replace` (inline confirm, the file becomes the document). A short result line reports what happened.     |
| Placement     | `Export` and `Import` sit in a footer of the overlay's rail, under the group list. The import strip (file facts, Merge, Replace, Cancel, then the result) renders in the same footer.                                                                                                           |
| Router access | Unchanged: components call `MarksNav`, never the router. The new `openHere` is the only addition to the nav. The URL arithmetic is a pure function so it is tested without a router.                                                                                                            |

## 1. Open here

### `src/lib/marks-nav.ts` (new)

```ts
import type { Page } from "../router.js";
import type { Mark, MarkKind } from "./marks.js";

/** Pages whose panels can show a mark's kind. */
export const showsKind = (page: Page, kind: MarkKind): boolean =>
  kind === "event" ? page !== "volcanoes" : page !== "earthquakes";

export interface HereTarget {
  /** Path and query to push. */
  url: string;
  /** True when the page had to change to Active Earth. */
  switched: boolean;
}

/**
 * The current view with the mark's subject selected: overlay keys and the other selection key
 * dropped, `event` or `volcano` set to the mark's ref, region and every other key kept. When the
 * page cannot show the kind the path becomes `pagePath("active", region)`.
 */
export function hereTarget(
  page: Page,
  region: string,
  query: Record<string, string>,
  mark: Mark,
): HereTarget;
```

`query` is the route query with the overlay keys already removed and array values dropped
(`App.vue` has `withoutOverlay`; a small `flatQuery` helper beside it keeps only string values).
`hereTarget` returns `url` as `path + "?" + new URLSearchParams(query).toString()` (no `?` when
the query is empty); `App.vue` pushes the string, the same way `goTo` does. The region string is
the route's `region` param or `global`.

### `MarksNav`

```ts
/** Selects a mark's subject in the current view; switches to Active Earth when the page cannot show it. */
openHere: (mark: Mark) => void;
```

`App.vue` implements it: compute `hereTarget(page.value, routeRegion.value, flatQuery(...), mark)`,
push `url`, and when `switched` post `Switching to Active Earth` to the notice store.

### Components

`MarkRow.vue`: `Open here` (class `openhere`) before `Open view` in `.mactions`.
`MarkPanels.vue`: the same button before `Open view` in the card header. Both call
`nav.openHere(mark)`. Titles: `Open view` keeps none; `Open here` gets
`title="Select it in the view you were in"`.

## 2. Notice

### `src/lib/notice.ts` (new)

```ts
export interface NoticeStore {
  current: Readonly<Ref<string | null>>;
  /** Shows `text` for `ms` milliseconds; a new post replaces the text and restarts the timer. */
  post(text: string, ms?: number): void;
  /** Clears the text at once. */
  clear(): void;
}
export const NOTICE_MS = 2500;
export function createNotice(
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = {
    set: setTimeout,
    clear: clearTimeout,
  },
): NoticeStore;
```

`keys.ts`: `NOTICE: InjectionKey<NoticeStore>`. `App.vue` creates it, provides it and renders
`<div v-if="notice.current.value !== null" class="notice" role="status">{{ notice.current.value }}</div>`
after `MarksOverlay`. Styles: fixed, bottom 20 px, centred, pill, surface colour with a border,
`pointer-events: none`, above the overlay (z-index over `.marks`). A fade is a CSS transition on a
`<Transition name="notice">`; tests only check presence.

`test/support/mount.ts` adds `notice: NoticeStore` to the context (`createNotice()` with fake
timers from `vi`), provided under `NOTICE`.

## 3. Group order

### `MarksStore`

```ts
/** Moves a stored group one place up (-1) or down (1); ends and unknown ids are no-ops. */
moveGroup(id: string, delta: -1 | 1): void;
```

Persisted like `move`. The rail renders `store.groups.value` in array order already, so no change
there.

### `MarksOverlay.vue`

In `.marks-grouphead`, before the name, a `.morder` block identical to the row's (`▲` `Move group
up`, `▼` `Move group down`), rendered only when `!view.virtual`, each disabled at its end. The
index comes from `store.groups.value.findIndex((g) => g.id === view.id)`.

## 4. Export and import

### `src/lib/marks.ts`

```ts
export interface MarksDocument {
  marks: Mark[];
  groups: MarkGroup[];
}
export interface MergeReport {
  marks: number; // marks added
  groups: number; // groups added
  members: number; // members added to groups already present
}

/** The JSON text of a document as the file carries it. */
export function exportDocument(doc: MarksDocument, now: Date): string;
// JSON.stringify({ v: 1, exportedAt: now.toISOString(), marks, groups }, null, 2)

/** The file name for an export made at `now`. */
export const exportFileName = (now: Date): string =>
  `tectonic-marks-${now.toISOString().slice(0, 10)}.json`;

/**
 * `current` plus whatever `incoming` has that it lacks: marks by id (appended after the current
 * ones, in file order), groups by id (appended), and for a group present in both, the members the
 * current group lacks (appended, only ids the merged mark list knows).
 */
export function mergeDocuments(
  current: MarksDocument,
  incoming: MarksDocument,
): { doc: MarksDocument; report: MergeReport };
```

`parseMarks` already returns a `MarksDocument` shape and is what the import uses on the file text.
An import whose parse yields zero marks and zero groups is "not a marks file" (this also covers an
unparseable file, since `parseMarks` returns empty for one).

`MarksStore` gains:

```ts
/** The document as stored. */
document(): MarksDocument;
/** Adds what the document has that the store lacks; returns what was added. */
merge(doc: MarksDocument): MergeReport;
/** Discards the stored document for this one. */
replaceAll(doc: MarksDocument): void;
```

Both persist.

### `MarksIO.vue` (new component)

Rendered at the foot of `.marks-rail` by `MarksOverlay.vue`. State machine: `idle` →
`picked(doc, name)` → `done(text)` → `idle` after `RESULT_MS` (4000). Markup:

- idle: `Export` button, `Import` button and a hidden `<input type="file" accept="application/json,.json">`
  the button clicks.
- picked: `<name>: N marks, M groups` then `Merge`, `ConfirmButton label="Replace"`, `Cancel`.
- done: the result text, e.g. `Added 3 marks, 1 group, 2 memberships` (zero parts omitted,
  `Nothing new` when all are zero), `Replaced with 12 marks, 2 groups`, `Not a marks file`.

Export builds a `Blob`, an object URL and an anchor with `download = exportFileName(now)`, clicks
it and revokes the URL. The clock comes from the injected `CLOCK`. Reading uses `file.text()`;
tests pass a `File` built from a string, which jsdom supports, and spy on `URL.createObjectURL`,
`URL.revokeObjectURL` and `HTMLAnchorElement.prototype.click`.

A pure `countsText(marks, groups)` and `reportText(report)` live in `marks.ts` beside the merge so
the pluralisation is unit tested.

Styles: `.marks-io` at the bottom of the rail (`margin-top: auto`), buttons as the rail's, the
strip as small text with the three buttons on one line and wrapping allowed; the rail already
stacks on narrow screens, so the footer follows it.

## Tests

- `test/lib/marks-nav.test.ts`: `showsKind` for the three pages × two kinds; `hereTarget` keeps
  region and query, drops `volcano` when selecting an event and the reverse, switches to
  `/active/<region>` only on mismatch, `global` yields `/active`, empty query yields no `?`.
- `test/lib/notice.test.ts`: post shows, timer clears, a second post restarts the timer, `clear`.
- `test/lib/marks.test.ts`: `moveGroup` ends, unknown id, persistence; `exportDocument` shape and
  `exportFileName`; `mergeDocuments` skips known marks and groups, adds missing members, ignores
  members naming unknown marks, counts; `document`, `merge`, `replaceAll` persist; `countsText`,
  `reportText` singulars, plurals and zero parts.
- `test/components/MarkRow.test.ts` and `MarkPanels` (in `MarksOverlay.test.ts`): `Open here`
  calls `nav.openHere` with the mark.
- `test/components/App.test.ts`: `openHere` from the overlay on `/volcanoes/wc?from=...&marks=all`
  with an event mark lands on `/active/wc?from=...&event=<ref>` and the notice shows; on
  `/earthquakes/wc?volcano=1&marks=all` an event mark lands on `/earthquakes/wc?event=<ref>` with
  no notice; a volcano mark on `/earthquakes` switches.
- `test/components/MarksOverlay.test.ts`: group arrows present only for stored groups, disabled at
  the ends, call `moveGroup`; `MarksIO`: export clicks an anchor named for the date with a JSON
  blob; import of a valid file shows counts, Merge reports, Replace asks then reports, Cancel
  returns to idle; a bad file reports `Not a marks file`; the result clears after `RESULT_MS`.

Coverage stays at 100% on `apps/web/src`.

## Docs

- README front-end bullet under Marked events: `Open here`, group order, export and import (what the
  file holds, Merge versus Replace).
- CLAUDE.md Marks bullet: `marks-nav.ts` (`hereTarget`), `notice.ts` (`NOTICE` key), `MarksIO.vue`,
  `moveGroup`, `merge`/`replaceAll`.

## Out of scope, recorded for later

Pin and Probe; a card-rows editor in the Settings menu; exporting a single group; importing from a
URL.
