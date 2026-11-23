# Fetch feedback

The reader needs to know whether what the page shows already reflects her refinements.

## Decisions

- The map says what it is fetching: `MapShell`'s `busy` prop puts a `role=status` chip over the
  map ("Loading events…", "Loading volcanoes…", "Loading events and volcanoes…") and dims the
  map's layers, both after 150 ms so a quick answer does not flash.
- Each refine bar says where its data stands, beside the summary: "Updating…" with a spinner
  while its dataset is fetched, "✓ Updated" for `UPDATED_MS` (2.5 s) once it lands, "Not
  updated" in red when the fetch failed, the error in its hint. The page's error banner stays.
- `catalog.loading` is computed from separate flags for the preset and range loads; it used to
  be one flag that whichever load finished first cleared, and dropping a range mid-fetch left it
  set.
- Magnitude, depth and the volcano refinements filter in the browser, so they apply at once and
  need no status; date windows and floors below the loaded one fetch, and show it.
- Focal mechanisms default to off: at window magnitudes the beachballs crowd the map.
