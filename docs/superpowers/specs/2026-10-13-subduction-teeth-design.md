# Subduction teeth

Date: 2026-10-13
Status: approved

## Context

The map draws PB2002 plate boundaries by step class but, as the prototype notes
recorded, "subduction teeth are not drawn yet; PB2002 encodes polarity". The
polarity is already in the data the API serves: Bird's boundary titles name the
plate on the left of the digitised direction first ("as one travels along the
segment, looking down from outside the Earth"), and byte 3 is `/` when the
right-hand plate subducts under the left-hand one, `\` for the opposite, `-` for
non-subducting boundaries. `apps/server/data/geo/plates.json` keeps the titles
and the point order (its first subduction segment matches the original `.dig`
file point for point), so the overriding side of every subduction step is the
left of the travel direction for `/` and the right for `\`. No regeneration and
no API change are needed.

## Decisions

| Topic    | Choice                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Geometry | pure function in `apps/web/src/lib/teeth.ts`: projected polyline + zoom + side → SVG path data; teeth keep a constant screen size at any zoom |
| Layer    | `MapTeeth.vue`, one `<path>` per subduction segment, filled in the plate colour, above the plate lines and below the epicentres               |
| Toggle   | a third toolbar checkbox "Subduction teeth", default on, independent of "Plate boundaries"                                                    |
| Tooltip  | subduction steps gain "X subducts under Y" with plate codes expanded through Bird's 52-plate table; unknown codes fall back to the code       |
| Legend   | the Subduction swatch shows two teeth above its line                                                                                          |
| Scope    | teeth only on steps classed `sub`; non-subduction steps inside slash-named boundaries get neither teeth nor the sentence                      |

## 1. `apps/web/src/lib/teeth.ts`

- `type Overriding = "left" | "right"`.
- `polarity(title)`: `/` → `"left"`, `\` → `"right"`, anything else → `null`.
- `teethPath(points, k, side, opts?)`: `points` is a projected polyline in
  viewBox units with `null` entries as breaks. Spacing is 14 ÷ k^0.75 and tooth
  height 6 ÷ k^0.75 (base 0.9 × height), the same zoom law as the markers.
  Teeth are placed every spacing along the line starting half a spacing in,
  carrying the remainder across vertices; a break or a zero-length step resets
  the carry. Steps longer than 200 units are skipped, which drops the few that
  straddle the map edge after projection. The apex sits on the geographic left
  of the travel direction for `"left"` (screen normal `(dy, −dx)`, correct for
  both projections since neither mirrors) and on the right for `"right"`.
  Returns one path string (`M…L…L…Z` per tooth), coordinates to two decimals.

## 2. `apps/web/src/lib/geo.ts`

- `PLATE_NAMES`: the 52 PB2002 codes to names; `plateName(code)` falls back to
  the code.
- `PLATE_CLASSES.sub` gains `teeth: true` (others `false`) for the legend.
- `PlateProps` gains `overriding: Overriding | null`; `plateFeature` sets it
  from `polarity(s.b)` for `sub` steps only and appends
  ` · <subducting> subducts under <overriding>` to the title.

## 3. Components

- `MapTeeth.vue` props `{ frame: MapFrame; segments: PlateSegment[]; k: number }`.
  For each `sub` segment with a polarity it projects the points (null where the
  projection returns null) and renders `<path :d="teethPath(...)">` with
  `fill: var(--plate)`. Recomputes when `k` or the frame changes.
- `QuakeMap.vue` keeps the raw segments alongside the features, adds
  `showTeeth` and the checkbox, and renders `MapTeeth` after `MapPlates`.
- `MapLegend.vue` draws two triangles above the swatch line for classes with
  `teeth`.

## 4. Tests

`teeth.test.ts`: polarity for `/`, `\`, `-`; a horizontal 100-unit line at k=1
yields seven teeth with apexes at y = −6 for `"left"` and +6 for `"right"`;
k=16 packs them 1.75 apart; a 500-unit step yields nothing; a null break and a
zero-length step reset the carry; empty input yields "". `geo.test.ts`: both
polarities in the title, unknown code fallback, `overriding` null off
subduction. `MapTeeth.test.ts`: one path per eligible segment, none for a
subduction step with a hyphen title, path changes with `k`. `QuakeMap.test.ts`:
the checkbox hides the layer. `MapLegend.test.ts`: the subduction swatch has
teeth. Coverage stays 100%.

## 5. Docs

README front-end bullet; `apps/server/data/geo/README.md` records the title
convention; `CLAUDE.md` front-end section mentions `teeth.ts`.

## Out of scope

Teeth on other convergent classes (no polarity in the data), velocity arrows,
the frozen `quake/` notes.
