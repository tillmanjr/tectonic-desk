# Event filters: magnitude and depth

Date: 2026-10-13
Status: approved

## Decisions

| Topic        | Choice                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filters      | magnitude range and depth range (km), each bound optional; inclusive; a bound left empty is open                                                                        |
| Scope        | applied to the map, the catalog table and the three charts; not to the summary tiles or the major-event cards; the detail panel's sequence logic keeps the whole window |
| Placement    | a filter bar between the major-event cards and the map, with a Clear button and "Showing N of M events"                                                                 |
| URL          | `minMag`, `maxMag`, `minDepth`, `maxDepth` query parameters next to `event`; empty bounds drop their parameter; filters survive a region switch                         |
| Floor        | the magnitude minimum cannot go below the preset floor (4.5 global, 2.5 West Coast): the input's `min` attribute and the parser both clamp it                           |
| Nulls        | events without a depth are excluded while either depth bound is set; events without a magnitude while either magnitude bound is set                                     |
| b-value      | Mc = max(preset floor, magnitude minimum); the caption names whichever applies                                                                                          |
| Chart floors | the magnitude axes of all three charts start at that same effective floor                                                                                               |

## Modules

- `apps/web/src/lib/filters.ts`: `EventFilter`, `EMPTY_FILTER`, `isActive(f)`, `parseFilter(query, floor)` (coerces numbers, drops NaN and empty strings, clamps `minMag` to the floor), `filterQuery(f)` (the query-parameter object), `applyFilter(events, f)`.
- `Catalog` gains `filter: Ref<EventFilter>`, `setFilter(f)`, `filtered: ComputedRef<ApiEvent[]>` and `floor: ComputedRef<number>` (the effective Mc).
- `FilterBar.vue`: four number inputs (magnitude step 0.1 with `min` = preset floor; depth step 1, min 0 is not enforced because negative depths exist), Clear, the count line. It calls the injected `SET_FILTER`, which `App.vue` turns into a `router.replace` with the query; a `routeFilter` computed feeds `catalog.setFilter`, so the URL is the single source of truth, as for `event`.
- `QuakeMap`, `CatalogTable`, `MagnitudeTimeChart`, `FrequencyMagnitudeChart`, `DepthChart` read `catalog.filtered` and `catalog.floor`. The table header reads "N of M events" while a filter is active.

## Tests

`filters.test.ts` covers each bound alone, both, none, inclusivity at the bounds, null depth and magnitude handling, clamping, NaN and empty input, and query round-trips. `catalog.test.ts` covers `filtered` and `floor`. `FilterBar.test.ts` covers typing values, the clamp attribute, Clear, and the count line. `App.test.ts` covers the query round-trip. Chart tests cover the raised Mc caption. Coverage stays 100%.
