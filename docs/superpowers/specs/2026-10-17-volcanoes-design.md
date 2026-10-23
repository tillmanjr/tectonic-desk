# Volcanoes page

Date: 2026-10-17. Status: approved. Research: `docs/research/2026-10-17-volcanoes.md`.

## Goal

A second page beside the earthquake page: the Smithsonian GVP Holocene catalogue on the same
two map views, live alert status for monitored US (USGS) and New Zealand (GeoNet) volcanoes,
GVP Weekly Volcanic Activity Report entries when reachable, eruption history per volcano, and
recent earthquakes as context. Written for a geologist; agency scales stay separate.

## Data

### Reference, generated and checked in

`pnpm --filter @tectonic/server geo:volcanoes` (`src/gvp-cli.ts`, pure functions in
`src/geo/gvp.ts`) pulls three GVP WFS layers (`webservices.volcano.si.edu/geoserver/GVP-VOTW/ows`,
WFS 2.0, GeoJSON output) and writes two files under `apps/server/data/geo/`, served by the
existing `GET /api/geo/:name`:

- `volcanoes.json`: `Volcano[]` from `Smithsonian_VOTW_Holocene_Volcanoes`:
  `{ number, name, country, region, subregion, lat, lon, elevationM, type, landform, rockType,
tectonicSetting, lastEruptionYear (number | null), evidence, summary }`.
- `eruptions.json`: `Eruption[]` from `Smithsonian_VOTW_Holocene_Eruptions`, with `continuing`
  joined from `E3WebApp_Eruptions1960` by eruption number:
  `{ number, volcano, activity, vei (number | null), veiModifier, startYear, startMonth,
startDay, startUncertainty, endYear, endMonth, endDay, continuing }`.

Both carry a header `{ source, release, pulledAt }` via a sibling `volcanoes-meta.json`? No:
each file is `{ meta: { source, pulledAt }, items: [...] }`. `data/geo/README.md` records
the command and pull date. GVP terms: non-commercial, attribution with the VOTW DOI; the footer
credits it.

### Live, polled into Postgres

Tables (new migration):

- `volcano_status`: `id serial, source ('usgs'|'geonet'), key text` (USGS vnum or GeoNet
  volcanoID), `number int null` (GVP number; GeoNet mapped by a 12-row table in code),
  `name text, level text` (USGS alert level or GeoNet level 0..5 as text), `color text null`
  (aviation colour), `noticeAt timestamptz null, synopsis text null, url text null,
observedAt timestamptz not null`. One row per observed change: the poll compares the
  fetched state with the latest row per `(source, key)` and inserts only when `level`,
  `color` or `noticeAt` differ. Index on `(source, key, observedAt desc)`.
- `volcano_reports`: `id serial, number int, name text, week date` (the report's Wednesday),
  `category ('new'|'ongoing'), title text, body text, url text, fetchedAt timestamptz`,
  unique on `(number, week)`.

Jobs under the existing scheduler and `INGEST_ENABLED`, recorded in `ingest_runs` with new
kinds `volcano_status` (every `VOLCANO_STATUS_INTERVAL_MS`, default 15 min) and
`volcano_reports` (every `VOLCANO_REPORTS_INTERVAL_MS`, default 6 h). The `ingest_runs.kind`
check constraint widens accordingly; counters reuse `eventsInserted` for rows inserted.

Sources (`src/volcano/client.ts`, zod schemas in `src/volcano/schema.ts`, parsers in
`src/volcano/parse.ts`):

- USGS HANS `getMonitoredVolcanoes` (69 rows) merged with `getElevatedVolcanoes`; one status
  per vnum, elevated rows win.
- GeoNet `GET https://api.geonet.org.nz/volcano/val` (12 rows).
- GVP weekly report RSS `https://volcano.si.edu/news/WeeklyVolcanoRSS.xml`, fetched with a
  browser-like User-Agent. It was 403 from both the dev machine and the droplet on
  2026-10-17; a non-2xx is a failed run (`ok: false`, error text), never a crash, and the UI
  treats "no reports" as a state. Items parse to `(number from the link's vn=, name, week
from pubDate, category from the item's section, title, body)`.

### API (`src/routes/volcanoes.ts`, DTOs in `packages/shared/src/api.ts`)

- `GET /api/volcanoes/status`: `{ generatedAt, statuses: ApiVolcanoStatus[] }`, the latest row
  per `(source, key)`, each with `changedAt` (its `observedAt`). Cache 60 s.
- `GET /api/volcanoes/changes?days=7` (1..90): rows whose `observedAt` falls in the window,
  newest first. Cache 60 s.
- `GET /api/volcanoes/reports?weeks=4` (1..26): entries for the latest N report weeks.
  Cache 300 s.
- `GET /api/volcanoes/:number`: `{ statuses (history for that number, newest first),
reports (all weeks) }`. 404 when the number is not a positive integer. Cache 60 s.
- `/api/status` gains `runs.volcano_status` and `runs.volcano_reports`.

## Front end

### Shell and routing

`router.ts`: `/` and `/:region` render `EarthquakesPage`, `/volcanoes` and
`/volcanoes/:region` render `VolcanoesPage`, inside `App.vue`, which keeps the header, status
line, footer, shared state (catalog, status poll, clock, theme, zone) and the route-driven
region. A page switch (two buttons, `role=tablist`, "Earthquakes" and "Volcanoes") sits
beside the title; switching keeps the region and `tz` and drops page-specific query keys. The
earthquake page's body moves unchanged into `EarthquakesPage.vue`.

### Volcano state (`src/lib/volcanoes.ts`)

`createVolcanoes(api, now)`: loads `volcanoes.json` and `eruptions.json` once (cached for the
session), polls `/api/volcanoes/status` on the same feed-change signal the catalog uses, and
holds `/api/volcanoes/reports?weeks=4`. Derived: `byNumber`, `eruptionsByVolcano`,
`continuing` set, `statusByNumber` (USGS and GeoNet rows mapped to GVP numbers), `inRegion`
(bbox filter; the global view is everything), `filtered` (the refine bar), `recentChanges`.

Classification helpers: `eruptionClass(lastEruptionYear)` → `recent` (≥ 1950), `historic`
(1500..1949), `holocene` (< 1500), `unknown`; `typeGroup(type)` → `stratovolcano`, `shield`,
`caldera`, `cone` (pyroclastic/scoria/tuff/lava cones, maars), `dome`, `fissure`,
`submarine`, `other`; `settingGroup(tectonicSetting)` → `subduction`, `rift`, `intraplate`,
`unknown`; `statusRank` for sorting (USGS Warning > Watch > Advisory; GeoNet 5..1; else 0).

Filters in the URL (`?setting=&type=&age=&status=`), comma-separated, parsed and written
like the earthquake filter.

### Page (`VolcanoesPage.vue`)

In order: tiles, cards, refine bar, map, then a two-column section of table and charts, plus
a slide-in detail panel.

- **Tiles**: Elevated (USGS Advisory or higher, count, with the highest level named), GeoNet
  (count at level ≥ 1), Continuing eruptions (GVP flag, count in the current view), Changes in
  7 days (status rows, or weekly-report "new activity" entries when any exist).
- **Cards**: one per volcano that is elevated or changed in the last 7 days, sorted by rank
  then time: name, country, agency level and colour as a badge, "since <date>", synopsis
  (truncated), link to the notice.
- **Refine bar**: four selects (Tectonic setting, Type, Last eruption, Status) plus Reset,
  mirroring the earthquake bar's look; counts shown on the map overlay as "Showing N of M
  volcanoes".
- **Map** (`VolcanoMap.vue`): the same frames, basemap, plates, teeth and faults as the
  earthquake map, built on a shared composable `useMapView` extracted from `QuakeMap.vue`
  (zoom, lock, touch hints, tooltip plumbing, basemap and layer loading). A new
  `MapVolcanoes.vue` draws a triangle per volcano (constant screen size, 7 px minimum on
  touch), fill by eruption class (`--vc-recent`, `--vc-historic`, `--vc-holocene`,
  `--vc-unknown`), a 2 px ring in the aviation colour for monitored volcanoes with a status
  above normal, and a small plume glyph for continuing eruptions. Hover: "Name · Type ·
  Last eruption 1980 · USGS Watch/Orange". Click selects (`?volcano=number`). Legend rows
  for the four classes, the ring and the plume; the legend's earthquake rows (depth colours,
  magnitude sizes, beachball note) are off on this page. (Revised 2026-10-16: the original
  design drew the earthquake page's filtered events as a faint toggleable layer; it was
  removed after review as clutter. Nearby earthquakes remain in the detail panel.)
- **Table**: name, country, type, last eruption, status, elevation; sorted by status rank
  then name; clicking a row selects.
- **Charts**: eruption starts per decade since 1800 for the filtered set (bar chart, caption
  stating the observation bias), VEI distribution (bars 0..7 plus unknown).
- **Detail panel**: name, country and region, GVP fields (type, landform, rock, setting,
  elevation, evidence), the geological summary, current status with history (agency, level,
  colour, since, synopsis, notice link), weekly-report entries, a VEI-versus-time strip for
  eruptions since 1800 (bar height VEI, open bar when continuing, hatched when the VEI carries
  a modifier; count of earlier eruptions as text), earthquakes within 50 km in the loaded
  window (count and the three largest, each clickable), and links to the GVP page and, for US
  volcanoes, the observatory notice.

### Styling

New colour variables for the eruption classes in both themes; aviation colours as variables
(`--av-yellow`, `--av-orange`, `--av-red`); the triangle marker uses `vector-effect:
non-scaling-stroke`.

## Testing

Server: `gvp.ts` on trimmed WFS fixtures (three volcanoes, five eruptions, two since-1960
rows); volcano parsers on trimmed real HANS and GeoNet responses and a constructed RSS
fixture; repositories (change detection, latest-per-key, windows) against Testcontainers;
routes; scheduler running the new jobs; config defaults. Web: `volcanoes.ts` helpers and the
store on small fixtures; every new component; the page switch and route in the App tests;
the extracted `useMapView` keeps the existing `QuakeMap` tests green. Coverage stays 100%.

## Docs

README (page, data sources, generator command, env), CLAUDE.md (page structure, volcano
module conventions), `data/geo/README.md`, the footer credit.

## Out of scope

Ash advisories, thermal and SO2 products, JMA, Iceland and INGV feeds, the Pleistocene layer,
notifications, volcano-specific regions.

## Addendum 2026-10-22: the two loose ends

**Weekly report.** The feed loads in a browser and in headless Chrome with a browser user agent,
and answers 403 to every other client (curl, Node's fetch, headless Chrome under its own name),
from the dev machine and from the droplet alike; the 403 renders a Smithsonian "temporarily
unavailable" page, so it is a Cloudflare bot rule for the whole host. A GitHub-hosted runner's Chrome
with a browser user agent was refused as well (2026-10-23), so the rule also covers datacenter
addresses and a hosted mirror is out. Two measures: GVP is asked by mail to allow the site's
agent, and until then `pnpm feeds:mirror` (`scripts/weekly-report-mirror.js`, run from an
ordinary machine) fetches the feed through the local Chrome, re-encodes it as UTF-8 and commits
it to the `feeds` branch when it changed. The server asks the feed first and reads the raw copy only when the feed refuses
(`WEEKLY_REPORT_MIRROR_URL`), so it goes back to the source by itself; a run that gets neither
fails with both reasons. Reading the live feed also corrected the parser: items link to the
report page and carry the volcano in the guid as `#vn_<number>` (the old `vn=` link form is still
read), and the kind of report is in the title (`New Eruptive Activity` / `Continuing Eruptive
Activity`). The feed is declared ISO-8859-1, so documents are decoded by their declaration.

**USGS synopsis.** HANS lists give level, colour and a notice link but no words. On each status
poll the elevated US volcanoes' current notices (one per distinct notice identifier) are fetched
from the notice API's text rendering (`getNoticeFormatted/{id}/text`), and each volcano's
`Summary:` line, or its first paragraph, becomes the status `synopsis` (`noticeSynopsis`). A
notice that fails to load is logged and leaves the synopsis null. Change detection is unchanged:
a new notice already produces a new row.
