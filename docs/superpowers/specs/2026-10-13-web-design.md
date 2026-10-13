# Tectonic Desk live build: Front end

Date: 2026-10-13
Status: approved

## Context

Sub-project 4 of the live build, the last one. Foundation, Ingest and API are
done: the server fills Postgres from USGS and serves seven JSON routes. This
sub-project ports the frozen prototype in `quake/template.html` to a Vue 3 +
Vite app in `apps/web`, driven by the API instead of an inlined snapshot, and
adds the nginx and Docker pieces that make the whole stack run with one
command.

The prototype's design, copy depth and mechanism conventions are kept. What
changes is forced by live data: a status line instead of a snapshot banner,
events that can lack a depth, mechanisms that arrive hours after the origin,
more than one solution per event, and links that should survive a reload.

## Decisions

| Topic      | Choice                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering  | Vue templates render the SVG and the table; D3 modules are used as libraries for projection, scales and zoom. No d3-selection, no d3-axis           |
| Refresh    | poll `GET /api/status` every 60 s; refetch the region's events when `lastSuccessfulFeed` changes. No sockets, no SSE                                |
| URL state  | vue-router, history mode: `/`, `/:region`, selection in `?event=id`                                                                                 |
| Basemap    | `world-atlas@2.0.2` `countries-50m.json` bundled in the web app as a lazy chunk; plates and West Coast outlines from `GET /api/geo/:name`           |
| Math       | tensor, axes, radiation and faulting-style functions move into `packages/shared`; only the canvas raster stays in the web app                       |
| Time       | UTC first, then the browser's local time with its zone abbreviation; "ago" from the browser clock                                                   |
| State      | one `Catalog` object created in `App.vue`, passed by provide/inject; composables, no Pinia                                                          |
| Testing    | Vitest 5 + happy-dom + Vue Test Utils, 100% thresholds on `apps/web/src` excluding `main.ts`; the API client is an interface faked in tests         |
| Lint       | eslint-plugin-vue flat recommended plus the repo's typescript-eslint strict and stylistic type-checked rules on `.vue` files; vue-tsc for typecheck |
| Deployment | `deploy/nginx.conf`, multi-stage Dockerfiles for web and server, compose `prod` profile running postgres, server and web; nginx on host port 8080   |
| Dev        | `pnpm dev` runs server and web in parallel; Vite proxies `/api` to `127.0.0.1:3000`                                                                 |

## 1. Shared additions (`packages/shared/src/mechanism/`)

Pure functions, no dependencies, NED frame, Aki & Richards conventions as in
`quake/CLAUDE.md`. `planes.ts` stays as it is.

| File          | Exports                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tensor.ts`   | `Tensor` (3×3 number tuple), `tensorFromPlane(plane: NodalPlane)`, `tensorFromAxes(t: Axis, p: Axis)`, `axesFromTensor(m): { t: Axis; p: Axis }` (2° grid search over azimuth 0..358 and plunge 0..90), `radiation(m, v)` (vᵀMv), `directionAt(x, y): Vec3 \| null` (lower-hemisphere equal-area inverse for a point in the unit disc, null outside)   |
| `classify.ts` | `faultingStyle(plane: NodalPlane): string` ("Thrust", "Reverse", "Normal", "Strike-slip", with an "Oblique " prefix as in the prototype), `strikeSlipSense(plane): "left-lateral" \| "right-lateral"`                                                                                                                                                  |
| `solution.ts` | `MechanismGeometry = Pick<Mechanism, "strike1" \| "dip1" \| "rake1" \| "strike2" \| "dip2" \| "rake2" \| "tAzimuth" \| "tPlunge" \| "pAzimuth" \| "pPlunge">`; `planesOf(m): { planes: [NodalPlane, NodalPlane]; reconstructed: boolean } \| null`; `tensorOf(m): Tensor \| null`; `axesOf(m): { t: Axis; p: Axis } \| null`; `projectAxis(a): [x, y]` |

`planesOf` returns the stored planes when `strike1` is present, otherwise
reconstructs them from the T and P axes through `planesFromAxes`, otherwise
null. `tensorOf` prefers the planes, then the axes. `axesOf` prefers the
stored axes, then the tensor grid search. A mechanism with neither planes nor
axes cannot be drawn; callers treat null as "no solution".

Regression check carried over from the prototype: for the reference events
`us6000u1pl`, `us6000u1kv`, `us6000u1gs`, `us6000u1ex` the tensor built from
plane 1 matches the tensor built from the published T and P axes to within
0.03 in every element (the axes are published to the whole degree).

## 2. Web application (`apps/web`)

Vue 3.5, Vite 8, vue-router 5, TypeScript strict with the repo base config
overridden for the browser (`lib` DOM, `moduleResolution` Bundler). Local
imports keep the `.js` extension on TypeScript files and `.vue` on components.

### Modules (`src/lib`)

| File           | Responsibility                                                                                                                                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.ts`       | `ApiClient` interface: `regions()`, `events(query)`, `event(id)`, `status()`, `geo(name)`; `createApiClient(fetch, base = "/api")`; errors become `ApiRequestError { status, message }` from the `{ error }` body                                                                                                                            |
| `catalog.ts`   | `createCatalog(api, clock)`: reactive `regions`, `region`, `events`, `truncated`, `loading`, `error`, `selectedId`; `setRegion(id)`, `select(id)`, `refetch()`; builds the query from the preset (`since` = now − `days`, `minMag`, `bbox`, `limit` 2000); a refetch keeps the current selection; a failed refetch keeps the previous events |
| `status.ts`    | `createStatusPoll(api, clock, onFeedChange)`: `status`, `error`, `fetchedAt`; polls every 60 s, pauses while `document.hidden` and polls at once when visible again; calls `onFeedChange` when `lastSuccessfulFeed` differs from the previous non-null value                                                                                 |
| `clock.ts`     | `createClock()`: `now` ref ticking every 30 s so "ago" labels stay current; injectable fixed clock in tests                                                                                                                                                                                                                                  |
| `format.ts`    | `fmtUtc`, `fmtLocal` (Intl with `timeZoneName: "short"`), `ago`, `fmtMoment` (mantissa × 10ⁿ N·m), `fmtCoord`, `fmtMag`                                                                                                                                                                                                                      |
| `depth.ts`     | `depthClass(km \| null)` → shallow, intermediate, deep, unknown; `depthColorVar` → the CSS variable name                                                                                                                                                                                                                                     |
| `sequence.ts`  | `distanceKm`, `sequenceOf(event, list, now)`, `parentOf(event, list)`: later events within 150 km of an M6.5+ mainshock, as in the prototype                                                                                                                                                                                                 |
| `stats.ts`     | `bValue(mags, mc)` (Aki 1965 estimator, Shi & Bolt 1982 uncertainty), `magnitudeBins`, `summary(events, now)` for the four tiles, `majorEvents(events, region)`                                                                                                                                                                              |
| `geo.ts`       | `projectionFor(region, bbox)`: Natural Earth I rotated 150° for global, conic conformal (parallels 33/45, rotate 120) for a region with a bbox, each fitted to its viewBox; `plateFeatures(segments)`; `PLATE_CLASSES` (subduction, other convergent, spreading, transform with widths and dashes)                                           |
| `beachball.ts` | `beachballUrl(m, px, fillColor, tensionColor, inkColor, showAxes)`: canvas raster using `directionAt` and `radiation`, T/P labels from `projectAxis`, memoised by its arguments; `clearBeachballCache()`                                                                                                                                     |
| `theme.ts`     | `createTheme()`: `mode` auto/light/dark persisted in `localStorage` as `td-theme`, applied as `data-theme` on `<html>`, `resolved` follows `prefers-color-scheme` in auto                                                                                                                                                                    |
| `colors.ts`    | `cssVar(name)` reading the computed custom property, used by the canvas raster and chart strokes                                                                                                                                                                                                                                             |

### Components (`src/components`)

| Component                                                                             | Responsibility                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App.vue`                                                                             | creates catalog, status poll, clock, theme; provides them; syncs route ↔ region and `?event`; page layout from the prototype                                                                                                                                                                      |
| `RegionTabs.vue`, `ThemeToggle.vue`                                                   | tab list with name and subtitle from `ApiRegion`; auto/light/dark cycle                                                                                                                                                                                                                           |
| `StatusLine.vue`                                                                      | "Live · USGS ComCat · feed synced HH:MM UTC · N min ago"; amber when the last sync is older than 30 minutes, red "API unreachable since HH:MM UTC" when the poll fails, "no feed sync yet" when null                                                                                              |
| `StatsStrip.vue`                                                                      | Events (with count in the last 24 h), Largest, Mechanisms, Deepest                                                                                                                                                                                                                                |
| `MajorEvents.vue`                                                                     | global: M6+ or any PAGER alert, by magnitude; West Coast: four largest. Card with beachball or "no solution yet", PAGER and tsunami pills, time, depth, style, sequence note                                                                                                                      |
| `QuakeMap.vue`                                                                        | viewBox per region, d3-zoom on the root group (scale 1..40, marker sizes divided by k^0.75), toolbar toggles for mechanisms and plates, zoom buttons, `zoomTo(event)` on selection; child layers below                                                                                            |
| `MapBasemap.vue`, `MapPlates.vue`, `MapEvents.vue`, `MapLegend.vue`, `MapTooltip.vue` | sphere, graticule, land and borders (world-atlas) or rect, 2° graticule, West Coast land and dashed states; plate paths by class with a `<title>`; circles for events without a drawable solution, `<image>` beachballs for the rest, selection ring; depth, size and plate legend; hover tooltip |
| `CatalogTable.vue`                                                                    | sortable by time, magnitude, depth, place; row click or Enter selects; selected row highlighted; "MT" or "FM" tag                                                                                                                                                                                 |
| `ChartAxes.vue`                                                                       | ticks and gridlines from a scale's `ticks()`, bottom and left                                                                                                                                                                                                                                     |
| `MagnitudeTimeChart.vue`                                                              | stems and circles over the window, caption from the largest event's sequence                                                                                                                                                                                                                      |
| `FrequencyMagnitudeChart.vue`                                                         | incremental bars, cumulative step line, fitted line, "b = x ± y", caption naming the estimator, Mc and the magnitude types                                                                                                                                                                        |
| `DepthChart.vue`                                                                      | magnitude vs depth scatter, 70 and 300 km lines on global, caption with shallow/intermediate/deep counts and negative-depth count on the West Coast. Events without a depth are left out and the caption says how many                                                                            |
| `DetailPanel.vue`                                                                     | fetches `GET /api/events/:id` on selection; header, origin block, preferred solution, other solutions, impact, sequence, catalog bookkeeping, USGS link; close button and Escape; side panel on desktop, bottom sheet on phones                                                                   |
| `MechanismBlock.vue`, `BeachballImage.vue`                                            | the 150 px beachball with axes, style, strike-slip sense, planes, axes, scalar moment, Mw, centroid depth, double-couple fraction, source network, reconstructed flag; `<img>` wrapper around `beachballUrl` that re-renders when the theme changes                                               |

### Data flow

1. On load, `App.vue` reads the route. `/` and `/global` select the global
   preset, `/wc` the West Coast preset; any other region redirects to `/`.
   `?event=id` sets the selection.
2. The catalog loads `GET /api/regions` once, then `GET /api/events` for the
   active preset. Every listed event carries its preferred mechanisms, so the
   map, cards, table and charts render from that one array. `mechanisms` with a
   drawable solution (`planesOf` not null) are drawn as beachballs, moment
   tensor before first-motion solution.
3. The status poll updates the header every minute. When
   `lastSuccessfulFeed` changes, the catalog refetches in place, keeping the
   selection and the zoom.
4. Selecting an event (card, map marker, table row, chart mark, sequence link)
   writes `?event=id`, highlights it everywhere, zooms the map to it and opens
   the detail panel, which fetches the detail route. Closing the panel clears
   the query. An event outside the current list still opens from the detail
   route; it just has no marker to ring.
5. Switching region clears the selection, resets the zoom and refetches.
6. A theme change clears the beachball cache and re-renders the rasters.

### Behaviour the live data forces

- Depth is nullable. Events without a depth draw in the muted colour, show
  "—" in the table and sit out of the depth chart.
- Magnitude is non-null in practice because every preset filters on `minMag`;
  the client still guards with a `fmtMag` that prints "—" for null.
- `eventType` other than `earthquake` is shown as a pill on cards and in the
  detail header (for example "quarry blast").
- "No solution yet" replaces "no MT". The detail panel distinguishes "USGS
  lists a moment-tensor product; the detail fetch runs after each feed sync"
  (when `types` advertises one) from "USGS has not published a solution".
- Multiple products: the detail panel shows the preferred moment tensor (or
  focal mechanism when there is no tensor) in full, then the other products
  as compact rows: source, kind, style, planes, reconstructed flag.
- `status` (reviewed or automatic) and `firstSeen` / `lastSeen` appear in
  the detail panel's catalog block.
- The depth caption no longer names a slab; the prototype's "Tonga–Fiji–
  Kermadec" sentence described one snapshot.
- `truncated` shows a banner: "Showing the newest 2000 events; the window
  holds more."

### Error handling

- Events fetch failure: banner with the message and a Retry button; the last
  good list stays on screen.
- Regions fetch failure on first load: the same banner over an empty page.
- Detail 404: the panel reads "Event not found in the catalog" with the USGS
  link still offered. Other detail errors show the message and a Retry.
- Status poll failure: the status line turns red; nothing else changes.
- World basemap chunk failure: the map still draws plates and events over
  the sphere; the error is logged.

### Accessibility and layout

Carried over from the prototype: tab roles and `aria-selected`, focusable
rows activated with Enter, `aria-hidden` on the closed panel, Escape closes
it, focus outlines, reduced-motion respected, the 900 px and 600 px
breakpoints, bottom-sheet detail on phones.

## 3. Deployment

| File                     | Content                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/nginx.conf`      | listen 80; root `/usr/share/nginx/html`; `location /api/` proxies to `http://server:3000` with HTTP/1.1 and forwarded headers; `/assets/` immutable for a year; everything else `try_files $uri /index.html` with `index.html` not cached; gzip for text, JSON, JS, CSS, SVG |
| `apps/web/Dockerfile`    | stage 1 `node:24-alpine` with pnpm via corepack: install, build shared, build web; stage 2 `nginx:alpine` copying `dist/` and `deploy/nginx.conf`                                                                                                                            |
| `apps/server/Dockerfile` | stage 1 install and `pnpm -r build`, then `pnpm --filter @tectonic/server deploy --prod /out`; stage 2 `node:24-alpine` copying `/out`; entrypoint runs `node dist/db/migrate-cli.js` then `node dist/index.js`                                                              |
| `docker-compose.yml`     | existing `postgres`; new `server` (env `DATABASE_URL=postgres://tectonic:tectonic@postgres:5432/tectonic`, `INGEST_ENABLED=true`, depends on postgres healthy) and `web` (port `8080:80`, depends on server), both under `profiles: [prod]`                                  |
| `.dockerignore`          | node_modules, dist, coverage, quake, .git, .env                                                                                                                                                                                                                              |

`docker compose up -d postgres` keeps working for development. `docker compose
--profile prod up --build` runs the whole stack; the page is at
`http://localhost:8080` and the API at `http://localhost:8080/api/health`.

Root scripts: `dev` becomes `pnpm -r --parallel dev` (server and web), with
`dev:server` and `dev:web` for one at a time. `build`, `lint`, `typecheck`,
`test` and `test:coverage` already recurse and pick up the web package.

## 4. Testing

`apps/web/vitest.config.ts`: environment happy-dom, include `test/**/*.test.ts`,
coverage on `src/**/*.{ts,vue}` excluding `src/main.ts`, thresholds 100% on
lines, branches, functions and statements.

- `packages/shared`: `tensor`, `classify`, `solution` with numeric cases,
  including the four-event regression, the reconstructed-planes path, the
  grid-search axes against published axes, `directionAt` null outside the
  disc, every style branch.
- `lib`: every module in isolation. The API client with a fake `fetch`
  (success, `{ error }` body, non-JSON body, network failure). Catalog and
  status with a fake `ApiClient` and a fixed clock, using fake timers for the
  poll, the visibility pause and the feed-change refetch. Beachball with a
  stubbed 2D context asserting the pixel buffer and the axis labels.
- Components: mounted with Vue Test Utils and the fakes provided. Each
  rendered branch (no solution, PAGER pill, tsunami pill, non-earthquake
  type, null depth, truncated banner, every status-line state, sort
  directions, detail 404, other solutions, sequence note and link, theme
  cycle). The map's zoom is driven by calling the exposed handlers rather than
  by synthesising wheel events.
- Live check: with the compose Postgres and `pnpm dev` running, the page is
  opened in Chrome and the layout, region switch, selection from each entry
  point, beachballs, theme toggle and status line are verified against the
  loaded catalog before the sub-project is reported done. Then
  `docker compose --profile prod up --build` is verified to serve the page and
  `/api/health` on port 8080.

## 5. Documentation

- `README.md`: Layout updated, a "Front end" section (routes, URL state,
  refresh behaviour), a "Deployment" section (compose prod profile, nginx),
  scripts table with `dev:server`, `dev:web`.
- `CLAUDE.md`: a "Front end" section (where the math lives, provide/inject
  fakes in tests, `.vue` lint, Vite proxy, no d3-selection) and the deployment
  note.
- `apps/web/README.md` replaced with a short description.

## Out of scope

Subduction teeth, Quaternary faults, cross-sections, user-defined regions,
Server-Sent Events, Playwright, volcanoes, space weather.
