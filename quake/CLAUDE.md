# Tectonic Desk

An earth-sciences dashboard for a reader with formal geology training. Write the copy and the drill-down depth for a peer, not a novice. Scope: earthquakes now, volcanoes next, space weather after that.

## Requirements (from the owner)
- Two views, Global and West Coast US. User-definable regions come later.
- Each view gives summaries, the most recent events, and major events, with drill-down into the underlying data.
- Map views must show focal mechanisms (beachballs) as well as magnitude and depth.

## Current state: static prototype
A single self-contained HTML page built on a USGS snapshot taken 2026-10-12 06:53 UTC. It does not update.
- `template.html`: the page (styles, D3 map, charts, detail panel, focal-mechanism math). `build.js` injects data at `/*__DATA__*/`.
- `catalog.js`: snapshot catalogs (global M4.5+ over 7 d, West Coast M2.5+ over 30 d), `MECH` solutions, `DETAIL_ONLY` impact fields.
- `plates.json`: PB2002 boundaries (Bird 2003), merged from the step file by STEPCLASS into sub/conv/spread/trans, with mean relative velocity. The source repo `fraxen/tectonicplates` is only needed to regenerate it.
- `wc_land.json`, `wc_states.json`: Natural Earth 10m, clipped to bbox -136,27,-104,53.
- `bb.js`: standalone mechanism math. `smoke.js`: headless jsdom test.

Build:
`npm i world-atlas@2.0.2 us-atlas@3.0.1 && node build.js` → `tectonic-desk.html`

Smoke test:
`npm i jsdom@24.1.0 d3@7.8.5 topojson@3.0.2 && node smoke.js`

## Mechanism conventions (verified, keep them)
- NED frame, Aki & Richards SDR → M. Lower-hemisphere equal-area projection; compressional quadrants shaded.
- Check: the M rebuilt from SDR matches the USGS P/T-axis M to within about 0.02 on four test events.
- Some `nc` preferred moment tensors publish only P/T axes. For those, nodal planes are reconstructed from n=(T+P)/√2 and d=(T−P)/√2, and the UI labels them as reconstructed.
- The `nn` network reports percent-double-couple as a percentage (91.00); `us` and `nc` report it as a fraction. Normalize it.
- Use the preferred product, which is `products["moment-tensor"][0]`. Fall back to `focal-mechanism`.

## USGS endpoints
- Summary feeds: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{significant|4.5|2.5|1.0|all}_{hour|day|week|month}.geojson`
- Query: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=…&minmagnitude=…&minlatitude=…`
- Event detail and products: `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=<id>&format=geojson`

## Next: live build
Stack: Fastify/Node + PostgreSQL + Vue, behind nginx.
- Poller: ingest the summary feeds and upsert by event id, since events get revised.
- Detail fetch: pull the moment-tensor product when it appears. It can lag the origin by hours.
- History: keep events in Postgres past the feed windows.
- Front end: reuse the prototype's mechanism math and design.

Known gaps:
- Several Mww events had no mechanism retrieved in the snapshot. It is unresolved whether USGS lacks one or retrieval missed it.
- The page layout was never visually verified in a browser.
- Subduction teeth are not drawn yet. PB2002 encodes polarity.

Candidate features:
- Quaternary faults on the West Coast view.
- A drawn cross-section with a depth profile.

Later sources:
- Volcanoes: Smithsonian GVP Weekly Volcanic Activity Report and USGS VHP alert levels. Verify the endpoints before relying on them.
- Space weather: NOAA SWPC JSON.
