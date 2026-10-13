# Tectonic Desk — status at pause (2026-10-12)

Prototype published as a private artifact ("Tectonic Desk"): a static USGS snapshot taken 2026-10-12 06:53 UTC.

## Files
- template.html — page source (styles, layout, rendering, focal-mechanism math). Data is injected at /*__DATA__*/
- catalog.js — snapshot: global M4.5+ over 7 d, West Coast M2.5+ over 30 d, moment tensor / focal mechanism solutions, detail-only fields
- plates.json — PB2002 boundaries merged by step class (sub/conv/spread/trans), with mean relative velocity
- wc_land.json, wc_states.json — Natural Earth 10m land and US states, clipped to the West Coast
- build.js — inlines everything into tectonic-desk.html (`npm i world-atlas@2.0.2 us-atlas@3.0.1`, then `node build.js`)
- bb.js — standalone mechanism math, verified against USGS P/T axes
- smoke.js — headless DOM test (needs jsdom, d3@7.8.5, topojson@3.0.2)

## Next
- Live build on the Windows machine: Fastify poller for the ComCat feeds plus per-event moment-tensor fetch, Postgres history, the same front end behind nginx
- Candidates: subduction teeth (PB2002 polarity), Quaternary faults on the West Coast view, a drawn cross-section with a depth profile, user-defined regions; then volcanoes (GVP weekly report, USGS VHP alert levels), then space weather (NOAA SWPC)
