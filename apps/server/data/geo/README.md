# Geo assets served by `GET /api/geo/:name`

Copied from the prototype (`quake/`) on 2026-10-13. Regenerate from the sources, do not edit by hand.

- `plates.json`: PB2002 plate boundaries (Bird 2003, G³ 4(3), 1027) via the `fraxen/tectonicplates` repository, merged by step class into `sub`, `conv`, `spread`, `trans`, with mean relative velocity. Shape: `[{ b: "AF-AN", c: "trans", v: 13.2, p: [[lon, lat], ...] }]`.
- `wc-land.json`, `wc-states.json`: Natural Earth 10m land and US states as TopoJSON, clipped to lon −136..−104, lat 27..53.
