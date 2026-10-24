# UI tune: card line cap, author link, column filters

Date: 2026-10-24. Sub-project: Front end. Status: approved, one PR with a commit per task.

## Why

Three items from the reader's note `UI Items to clean up or tune.md`: the Kilauea card runs ten
lines of synopsis where other cards run four; the footer author link replaces the desk; and the
Catalog and Volcanoes tables sort but cannot be narrowed by column. The first two are one-line
fixes. The third adds table-local column filters, approved through mockups (option C with
`Clear all` in the title, Country as a select).

## Decisions

| Topic           | Decision                                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card lines      | The detail lines of a card (the when-line, then the synopsis or the sequence line) live in one `.lines` block clamped to five lines with an ellipsis. Title and pills stay above the clamp. The panel still shows everything.                        |
| Author link     | `target="_blank"` and `rel="author noopener"` on the footer anchor. Text unchanged.                                                                                                                                                                  |
| Scope of filter | Table-local: a column filter narrows the table's rows after the store's own filter and before sorting. The map, charts and Refine bars are untouched.                                                                                               |
| Placement       | Option C: a `Filter` toggle in the panel title opens a second header row holding the inputs. `Clear all` sits beside the toggle in the title and shows only while something is set. With the row closed and filters set, the toggle stays accent.    |
| Indication      | The title's count reads `12 of 146 events · filtered`; each header whose column is set carries the accent class; set inputs carry the accent border.                                                                                               |
| Lifetime        | In memory per table, not in the route. Reset when the region changes, like the card grids' "more" state.                                                                                                                                            |
| Controls        | Catalog: Time as two `type="date"` inputs in the zone in force, M and Depth as number pairs. Volcanoes: Volcano text contains (case-insensitive), Country select of the countries in the region, Type select of `TYPE_GROUPS`, Last eruption and Elev. m as number pairs. Status has no filter. |
| Nulls           | A row whose value is null for a bounded column drops out once either bound of that column is set. Text and selects ignore nulls (there are none).                                                                                                    |
| Apply           | Inputs apply on `change`. No Apply button.                                                                                                                                                                                                           |

## 1. Cards

`MajorEvents.vue` and `VolcanoCards.vue`: the `.m` spans move inside `<span class="lines">`.
Styles:

```css
.mcard .lines {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
}
```

`.mcard .m` stays `display: block` inside it. Tests assert `.lines` wraps the `.m` spans in both.

## 2. Footer

`App.vue`: `<a href="https://github.com/tillmanjr" rel="author noopener" target="_blank">`.

## 3. Column filters

### `src/lib/table-filters.ts` (new)

```ts
import type { ApiEvent, Volcano } from "@tectonic/shared";
import type { Zone } from "./format.js";
import type { TypeGroup } from "./volcanoes.js";

export interface EventTableFilter {
  since: string | null; // yyyy-mm-dd, in the zone
  until: string | null;
  minMag: number | null;
  maxMag: number | null;
  minDepth: number | null;
  maxDepth: number | null;
}
export interface VolcanoTableFilter {
  name: string | null; // trimmed, non-empty
  country: string | null; // exact
  type: TypeGroup | null;
  minYear: number | null; // signed; BCE negative, as stored
  maxYear: number | null;
  minElev: number | null;
  maxElev: number | null;
}
export const EMPTY_EVENT_TABLE_FILTER: EventTableFilter;
export const EMPTY_VOLCANO_TABLE_FILTER: VolcanoTableFilter;

/** How many columns carry a bound: Time, M, Depth count once each however many of their inputs are set. */
export function activeEventColumns(f: EventTableFilter): Set<"time" | "mag" | "depthKm">;
export function activeVolcanoColumns(f: VolcanoTableFilter): Set<"name" | "country" | "type" | "last" | "elevation">;

/** Rows within every set bound; `since` starts at the day's first instant, `until` ends before the next day's. */
export function applyEventTableFilter(events: ApiEvent[], f: EventTableFilter, zone: Zone): ApiEvent[];
export function applyVolcanoTableFilter(volcanoes: Volcano[], f: VolcanoTableFilter): Volcano[];

/** Countries of the given volcanoes, each once, sorted. */
export function countriesOf(volcanoes: Volcano[]): string[];
```

`applyEventTableFilter` uses `dayStart(date, zone)` from `filters.ts` for both ends (`until` is
inclusive: time < dayStart(next day)). Numeric bounds use `within` semantics from `filters.ts`
(inclusive; a null value fails once a bound is set); `within` is exported from `filters.ts` if it
is not already. The name match lower-cases both sides. The set keys mirror the tables' `SortKey`
values so the header class is a one-line lookup.

### `RangeInputs.vue` (new)

Props: `min: number | null`, `max: number | null`, `step?: string`, `label: string` (for the two
aria-labels, `"${label} from"` and `"${label} to"`), `placeholderMin = "min"`,
`placeholderMax = "max"`. Emits `update` with `{ min, max }` on either input's `change`, parsing
through `parseBound`. Each input gets class `set` when its value is non-null.

### `TableFilterHead.vue` (new)

Props: `open: boolean`, `active: number` (count of set columns). Emits `toggle` and `clear`.
Renders, right-aligned in the title: `Clear all` (class `clearall`, only when `active > 0`) and the
toggle (class `filtertoggle`, `aria-expanded`, class `on` when `active > 0`, text `Filter ▾` when
closed and `Filter ▴` when open).

### `CatalogTable.vue`

- `filter = ref(EMPTY_EVENT_TABLE_FILTER)`, `open = ref(false)`; both reset on
  `catalog.region.value?.id` change (`open` closes too).
- `narrowed = computed(() => applyEventTableFilter(events.value, filter.value, zone.value))`;
  `rows` sorts `narrowed`. `activeCols = computed(() => activeEventColumns(filter.value))`.
- Title: `<h2 class="withfilter">Catalog <span>…</span> <TableFilterHead …/></h2>`. The count
  span reads `narrowed.length of windowTotal events · filtered · tap a row for detail` when
  `activeCols.size > 0`, else as today.
- Header `th` gets class `fon` when `activeCols.has(c.key)`.
- Second `thead` row (`tr.frow`, `v-if="open"`): Time cell with two `type="date"` inputs
  (`min`/`max` from `dateBoundsFor(clock.now, zone)`, value from the filter, `change` sets
  `since`/`until` through `parseDate`), M and Depth cells with `RangeInputs`, Location cell empty.
  Clicking inside the row must not sort: the row's cells have no click handler (the sort handler is
  on the first row's `th` only).

### `VolcanoTable.vue`

Same shape: `filter`, `open`, reset on `store.region.value?.id`; `narrowed` from
`applyVolcanoTableFilter(store.filtered.value, filter.value)`; title reads
`narrowed.length of inRegion.length · filtered · tap a row for detail`. Row cells: Volcano text
input (`change` sets `name` trimmed or null), Country `<select>` with an empty `any` option and
`countriesOf(store.inRegion.value)`, Type `<select>` over `TYPE_GROUPS` with `any`, Last eruption
`RangeInputs` (step 1, placeholders `from`/`to`), Status cell empty, Elev. m `RangeInputs`.

### Styles

`.panel h2.withfilter { display: flex; align-items: center; }` with the count span keeping its
look and a spacer; `.filterhead` holds the two pills (34 px tall is the header pill height, but the
table title is smaller, so 24 px, 12 px font, `--line` border, accent border and text when `.on`).
`tr.frow th` has the panel's darker background, no sort cursor, `padding: 4px 6px 6px`; inputs
inside are 22 px tall, mono 12 px, `--line` border, accent border when `.set`; number inputs 54 px
wide, date inputs 120 px, text 140 px, selects auto. `th.fon` is accent-coloured.

### Tests

- `test/lib/table-filters.test.ts`: empty filters pass everything through unchanged (same array);
  each bound alone and together; null depth, year and elevation drop out only when their column is
  bounded; since/until in UTC and local; name case-insensitivity; country and type exactness;
  `activeEventColumns`/`activeVolcanoColumns` count a column once; `countriesOf` sorted unique.
- `test/components/CatalogTable.test.ts`: toggle shows the row; M min narrows the rows, marks the
  header and the title; date inputs narrow by day in the zone; Clear all resets and hides itself;
  region change resets and closes.
- `test/components/VolcanoesPage.test.ts` (where `VolcanoTable` is covered) or a new
  `VolcanoTable.test.ts`: the same for name, country, type, year and elevation.
- `MajorEvents.test.ts`, `VolcanoesPage.test.ts`: `.lines` wrapper. `App.test.ts`: the anchor's
  `target` and `rel`.

Coverage stays at 100%.

## Docs

- README: a bullet on the table filters (title toggle, row, Clear all, table-only scope) and a
  sentence on the five-line card cap.
- CLAUDE.md front end: `table-filters.ts`, `RangeInputs.vue`, `TableFilterHead.vue`, the reset rule.
- `.gitignore`: `.superpowers/`.
- `UI Items to clean up or tune.md` is the reader's own untracked note and is left in place.

## Out of scope, recorded for later

Filters in the route; sharing header filters with the Refine bars; a Status filter.
