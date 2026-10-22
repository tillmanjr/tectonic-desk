# Tectonic Desk

An earth-sciences dashboard: earthquakes now, volcanoes next, space weather considered after that.
Written for a reader with formal geology training.

## Layout

- `apps/server` Fastify + Drizzle + Postgres (TypeScript), with the USGS ingest
- `apps/web` Vue 3 + Vite front end (the port of the prototype)
- `packages/shared` domain types and focal-mechanism math shared by server and web
- `quake/` the original static prototype, frozen as historical reference
- `deploy/` nginx config for the production image
- `docs/superpowers` design specs and implementation plans

## Prerequisites

Node 24, pnpm 10, Docker Desktop.

## Setup

```bash
pnpm install
cp .env.example .env              # Postgres is exposed on host port 5433
pnpm db:up
pnpm db:migrate
pnpm ingest backfill --days 90    # optional: load recent history (several minutes)
pnpm dev                          # web on http://localhost:5173, API on http://127.0.0.1:3000
```

## Ingest

The server polls USGS while it runs (`INGEST_ENABLED`, default true):

- `2.5_day.geojson` every 5 minutes and `2.5_week.geojson` every hour. Global M2.5+ covers
  both the Global and West Coast views; the weekly pass catches late revisions. Events are
  upserted by id and only overwritten when USGS's `updated` stamp is newer.
- Events whose feed entry advertises a `moment-tensor` or `focal-mechanism` product get a
  detail fetch, re-done whenever the event is revised. Every product is stored; the heaviest
  per kind is marked preferred. Nodal planes are reconstructed from T and P axes when a
  network publishes only axes.
- Nothing is deleted. History accumulates past the feed windows. Every run is recorded in
  `ingest_runs`.
- History is loaded with `pnpm ingest backfill`, newest first, in calendar-month windows
  (calendar years before 1970). A window that ended more than 30 days before the run is
  recorded in `catalog_windows` once loaded and is never fetched again (`--force` overrides);
  younger windows are reloaded each run because USGS still revises them. Page requests pause
  one second apart and back off on 429 and 5xx. `GET /api/catalog/coverage` reports the frozen
  spans.
- `last_seen` is bumped at most once an hour per event, so polling a quiet catalogue does not
  rewrite it. An event whose USGS `ids` list names an id already stored replaces that row.

Set `INGEST_ENABLED=false` on a second API instance so only one process polls.

Volcano status (USGS HANS and GeoNet) is polled every `VOLCANO_STATUS_INTERVAL_MS` (default
15 min) and the GVP weekly report every `VOLCANO_REPORTS_INTERVAL_MS` (default 6 h), under the
same `INGEST_ENABLED` flag.

The API rate-limits each client address to `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS`
(default 120 a minute; 0 turns it off) and answers `429 { error }` with `Retry-After` and
`X-RateLimit-*` headers. Behind nginx set `TRUST_PROXY=true` so the limit applies to the forwarded
address rather than the proxy's; the compose `prod` profile does, and its nginx adds its own
`limit_req` (20 requests a second, burst 40) in front.

## API

All routes return JSON. Bad input is 400 `{ error, issues: [{ path, message }] }`, an unknown
id or path is 404 `{ error }`, anything else is 500 `{ error }`. Successful responses carry a
short `Cache-Control`.

| Route                       | Returns                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`           | `{ status, db }`, 503 when the database does not answer                                                                      |
| `GET /api/regions`          | the view presets: id, name, subtitle, minMag, days, bbox                                                                     |
| `GET /api/events`           | `{ events, count, truncated, query }`; each event carries its preferred mechanism per kind                                   |
| `GET /api/events/:id`       | the event with every mechanism product and the raw USGS properties as `usgs`                                                 |
| `GET /api/status`           | catalog totals, latest ingest run per kind, last successful feed time                                                        |
| `GET /api/runs`             | ingest run history, `?kind=feed_day\|feed_week\|backfill\|details&limit=N`                                                   |
| `GET /api/events/count`     | `{ count, query }` under the list filters                                                                                    |
| `GET /api/events/summary`   | `{ by, bins, query }`: per day, month or year (`by=`, default by span) with the largest magnitude and magnitude-class counts |
| `GET /api/events/grid`      | `{ cell, cells, query }`: counts per `cell`-degree square (0.25, 0.5, 1, 2 or 5)                                             |
| `GET /api/catalog/coverage` | `{ spans }`: contiguous frozen backfill windows per magnitude floor and bbox                                                 |
| `GET /api/geo/:name`        | `plates`, `wc-land`, `wc-states` from `apps/server/data/geo`, with an ETag                                                   |

`GET /api/events` filters: `since` and `until` (ISO 8601 date-time or `YYYY-MM-DD`; `since`
defaults to seven days ago), `minMag`, `bbox=minLon,minLat,maxLon,maxLat` (minLon > maxLon
crosses the antimeridian), `limit` (default 500, max 5000). Dates in responses are ISO 8601 UTC.
Types for every response are in `packages/shared/src/api.ts`.

## Front end

`apps/web` is the Vue 3 + Vite port of the prototype. `pnpm dev` runs the server and Vite together;
the page is at http://localhost:5173 and `/api` is proxied to port 3000.

- `/` is the Global view, `/wc` the West Coast view; `?event=<id>` opens the detail panel, so links
  are shareable.
- The status line polls `GET /api/status` every minute and refetches the catalog when a feed sync
  has landed. It turns amber after 30 minutes without a sync and red when the API is unreachable.
- Theme follows the system by default; the toggle cycles auto, light, dark.
- The focal-mechanism math lives in `packages/shared`; only the canvas raster is in the web app.
- The filter bar above the map narrows magnitude and depth (inclusive, either bound optional) for
  the map, catalog and charts; the summary tiles and major events stay unfiltered. Filters live in
  the URL (`minMag`, `maxMag`, `minDepth`, `maxDepth`); the magnitude minimum cannot go below the
  view's floor, and the b-value's Mc rises with it.
- A window (a length, from, to; inclusive calendar days) loads that span from the server for the
  map, catalog and charts. The inputs always show the window in force: "from" defaults to thirty
  days before today and "to" to today, and the magnitude minimum shows the view's floor; Reset
  returns to those defaults; only explicit bounds go in the URL (`since`, `until`). Dates reach
  back to 1900-01-01. The length select reads the dates (30 or 90 days, 1, 10 or 50 years, since
  1900, else Custom); picking a length sets "from" that far before "to", and changing "to" while a
  length is in force moves "from" with it. The header's "Times" button switches every date and
  time on the page, and the way the date filter is read, between UTC (default) and the browser's
  zone; it is kept in the URL as `tz=local`.
- The refine bars open collapsed, one line stating the refinements in force (set clauses in ink,
  defaults muted) with a small `edit` control that expands the inputs and `done` that folds them
  back. Each bar's `Hide markers` box takes that dataset's markers off the map and changes nothing
  else: counts, tables, charts, cards, density and the legend stay as they are.
- Major-event and volcano cards show a few rows and offer the rest behind `… N more`; the rows
  come from the settings store in `localStorage` (`tectonic.settings`, `cardRows.alone` 3 and
  `cardRows.combined` 1 by default; no editor yet).
- The volcano panel's "Earthquakes within 50 km" list dates each quake against the volcano's most
  recent eruption (the continuing one, else the latest start) as `1 mo 9 d after onset` or
  `3 d 5 h before onset`, as precisely as GVP dates the start; without an eruption record it keeps
  the "ago" wording.
- **Active Earth** (`/active`, third button in the page switch) shows both datasets together:
  earthquake summary and volcano tiles, one row each of major-event and volcano cards, both refine
  bars, one map with the volcano triangles under the earthquake markers and both legends, then the
  earthquake table and charts followed by the volcano table and charts. One selection is open at a
  time: picking a quake closes the volcano panel and vice versa.
- **Marked events.** `☆ Mark` under the name in either detail panel saves the view (page, region,
  window, filters and selection) under a name of your choosing, in the browser only
  (`localStorage`, `tectonic.marks`); nothing is sent anywhere. `Marks · N` in the header opens
  an overlay over the current view where marks can be renamed, deleted, reordered with `▲ ▼`,
  gathered into groups (`All` always holds every mark) and reopened with `Open view`. Each mark carries a small
  schematic of the world or the West Coast with a star at the event.
- **Show events** on a group lays its marks out as full panels, the same sections as the side
  panels, in as many columns as fit at 481 px or wider before wrapping to rows, so a set of events
  can be read together. The URL carries
  the overlay (`?marks=<group>`, `&show=panels`), so Escape, the close control and the back
  button all return to the untouched view.
- Long windows stay within a 2,000-event budget. The page first asks `GET /api/events/summary` for
  the window at the floor in force; if the total fits, every event is loaded, otherwise the marker
  floor is raised to M5, M6 or M7 (the lowest band that fits) and the page says so under the Refine
  bar and in the map's count line. In that overview mode the map offers a Density toggle (off by
  default) that shades `GET /api/events/grid` cells (2° globally, 0.5° on the West Coast) under
  the markers, the time chart shows events per day, month or year with the largest magnitude in
  each, and the table and magnitude charts use the raised floor (the b-value's Mc follows it).
- The time chart marks the breaks in the record whenever they fall inside the window: 1964 (WWSSN,
  ISC), 1973 (NEIC PDE enters ComCat) and 1976 (Global CMT). A step in the counts at those lines is
  detection, not seismicity.
- The West Coast view draws the USGS Quaternary Fault and Fold Database under the plate
  boundaries, coloured by age of last movement in the USGS convention (historic red through
  Quaternary grey) and solid, dashed or dotted by mapping certainty. A toolbar checkbox and menu pick
  which age classes are shown (all, none or any subset; the default is the historic and latest
  Quaternary classes, <15 ka); pointing at a trace names the fault, section, age, slip rate, slip sense and dip. The file
  is generated by `pnpm --filter @tectonic/server geo:qfaults` (see `apps/server/data/geo/README.md`).
- "Animate" on the map toolbar replays the loaded window: a tracking clock starts at the day
  before the window's first day with an empty map and adds the filtered events as it passes their
  origin times; set seconds per step (a day, a 30-day month or a 365-day year, chosen from the
  window length), start, pause, step either way, close.
- The map starts locked, so the wheel, a drag and one finger scroll the page past it; the
  buttons, clicking a marker and a two-finger pinch still zoom. The mouse icon in the map's
  top-right corner toggles the lock (a slash means locked) for free pan and zoom. On touch screens
  markers have a 7 px minimum radius, a hint explains the lock when a finger tries to drag, and the
  legend says how to pan.
- Markers are scaled from the floor in force (the view's, the filter's or the raised one), so the
  smallest shown is always the smallest dot and the legend's size key follows; they grow about
  fivefold on screen from zoom 1 to 40. Events without a mechanism are drawn as outlined discs in
  their depth colour.
- Subduction teeth point toward the overriding plate, read from Bird's `/` and `\` boundary titles;
  the plate tooltip says which plate subducts under which.

## Volcanoes

The header's Earthquakes | Volcanoes switch opens the second page on the same region views
(`/volcanoes`, `/volcanoes/wc`). It shows:

- The Smithsonian Global Volcanism Program's Holocene catalogue (1,214 volcanoes) as triangles
  coloured by age of last eruption (since 1950, 1500 to 1949, earlier Holocene, unknown), with a
  ring in the aviation colour for volcanoes whose agency alert is above normal and a dot above those
  GVP lists as continuing to erupt. Pointing names the volcano, type group, last eruption and
  status; clicking opens its panel (`?volcano=<GVP number>`).
- Live alert levels from the USGS Volcano Hazards Program (HANS, 69 monitored US volcanoes) and
  GeoNet (12 New Zealand volcanoes), polled every 15 minutes and stored as one row per change.
  Each agency's scale is shown as published; nothing converts one into the other.
- Tiles for elevated US volcanoes, GeoNet unrest, continuing eruptions in view, and either the
  latest weekly report's new-activity entries or the count of status changes in 7 days; cards for
  every volcano elevated or changed in 7 days.
- A Refine bar (tectonic setting, type group, last eruption class, status; in the URL as
  `setting`, `type`, `age`, `status`), a table, eruption starts per decade and a VEI
  distribution for the volcanoes shown, and a detail panel with GVP's fields and summary, the
  agency status history, weekly-report entries, a VEI-versus-time strip since 1800 with the
  eruption list, and the earthquakes of the loaded window within 50 km.

Reference data comes from `pnpm --filter @tectonic/server geo:volcanoes`, which pulls GVP's
volcanoes, eruptions and since-1960 layers over WFS into `apps/server/data/geo` (see its README).
The GVP/USGS Weekly Volcanic Activity Report is fetched every 6 hours from its RSS feed; the feed
sat behind a bot filter that answered 403 to servers when this was built, so a blocked fetch is
recorded as a failed run and the page falls back to the status-change count.

## Deployment

### Locally

`docker compose --profile prod up --build -d` builds and runs Postgres, the API (with ingest) and
nginx serving the built front end on http://localhost:8080 (`/api` is proxied). The server runs
migrations on start. `docker compose --profile prod down` stops everything; the data volume is kept.

### Production: tectonicdesk.org on a DigitalOcean droplet

Every push to the `release` branch runs `.github/workflows/deploy.yml`: lint, typecheck and tests,
then both images are built on freshly pulled base images and pushed to GitHub Container Registry
(`ghcr.io/tillmanjr/tectonic-desk-server` and `-web`, tagged `release` and with the commit), then
the droplet pulls them (and current caddy and postgres images) and restarts
`deploy/docker-compose.prod.yml` behind Caddy, which holds the TLS certificate. The same workflow
runs every Monday at 08:00 UTC (midnight or 1 am Pacific), and on demand from the Actions tab, so base images stay current
between pushes. `main` stays the integration branch; a pull request from `main` into `release`,
merged once its CI check passes, deploys. One-time setup:

1. **Droplet.** Ubuntu 24.04, Basic 1 GB in SFO3 (about $6), your SSH key added. As root:

   ```sh
   curl -fsSL https://get.docker.com | sh
   fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
   mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh
   mkdir -p /opt/tectonic-desk && chown deploy:deploy /opt/tectonic-desk
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```

   Once Cloudflare is in front (step 2), make the web ports answer Cloudflare only, so the origin
   cannot be reached around the proxy. ufw alone cannot do this (Docker routes published ports past
   it), so `deploy/cloudflare-firewall.sh` fills Docker's `DOCKER-USER` chain instead; the unit and
   timer beside it re-apply the rules on boot and refresh the ranges weekly:

   ```sh
   cp deploy/cloudflare-firewall.sh /opt/tectonic-desk/ && chmod +x /opt/tectonic-desk/cloudflare-firewall.sh
   cp deploy/cloudflare-firewall.service deploy/cloudflare-firewall.timer /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now cloudflare-firewall.service cloudflare-firewall.timer
   ```

   Caddy sends HSTS, a Content Security Policy and the other hardening headers from
   `deploy/Caddyfile`.

   Then, as `deploy`, create `/opt/tectonic-desk/.env`:

   ```sh
   POSTGRES_PASSWORD=$(openssl rand -hex 24)
   DOMAIN=tectonicdesk.org
   ACME_EMAIL=you@example.org
   TAG=release
   ```

   The images are built elsewhere, so 1 GB is enough; the swap file covers startup peaks.

2. **Cloudflare.** Add the site, point `A @` (and `AAAA @` if the droplet has IPv6) at the droplet,
   proxied, plus `CNAME www @`. Under SSL/TLS choose **Full (strict)**: Caddy fetches a real
   certificate from Let's Encrypt through the proxy, and the `www` host redirects to the apex. To
   keep the site private, add a Zero Trust Access application for `tectonicdesk.org` with a policy
   allowing your two email addresses (free for up to 50 users); the dashboard has no login of its
   own. Optionally limit the droplet's 80 and 443 to Cloudflare's ranges so nothing bypasses it.

3. **GitHub.** Repository secrets `DEPLOY_HOST` (the droplet's IP), `DEPLOY_USER` (`deploy`) and
   `DEPLOY_SSH_KEY` (a private key whose public half is in `deploy`'s `authorized_keys`; make a
   dedicated one with `ssh-keygen -t ed25519 -f deploy_key -N ""`). The workflow logs the droplet
   into GHCR with its own token, so the packages can stay private.

4. **First release.** Open and merge a pull request from `main` into `release` (the first time,
   `git push origin main:release` also works), watch the Deploy run, then load the history
   once:

   ```sh
   cd /opt/tectonic-desk
   docker compose -f docker-compose.prod.yml run --rm -d server \
     node dist/ingest-cli.js backfill --from 1900-01-01 --skip-details
   docker logs -f "$(docker ps -q --filter name=server-run | head -1)"
   ```

   The first command loads global M2.5+ back to 1900 in a few hours and freezes each settled
   window as it goes, so it can be stopped and rerun. Add
   `--from 1500-01-01 --to 1900-01-01 --all-magnitudes` for the pre-instrumental US record.
   Detail fetches (mechanisms) then drain through the feeds' detail pass, or faster with
   `node dist/ingest-cli.js details --by-magnitude --limit 5000`. Afterwards run
   `VACUUM (ANALYZE) events;` once through
   `docker compose -f docker-compose.prod.yml exec postgres psql -U tectonic tectonic`.
   Migrations run on every server start; ingest keeps polling from then on.

Day to day: `docker compose -f docker-compose.prod.yml logs -f server` for the ingest log,
`docker compose -f docker-compose.prod.yml exec postgres pg_dump -U tectonic tectonic | gzip > backup.sql.gz`
for a backup (the history also rebuilds from USGS with a backfill), and the Deploy workflow for
every update. The per-address rate limits key on the visitor's address all the way down: Caddy
trusts Cloudflare's ranges, nginx takes the client from `X-Forwarded-For`, and the API runs with
`TRUST_PROXY=true`.

## Scripts

| Script                                         | What it does                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                     | server and web together (Vite on 5173, API on 3000)                                                                                                                                |
| `pnpm dev:server` / `dev:web`                  | one of them                                                                                                                                                                        |
| `pnpm test`                                    | all tests; integration tests need Docker (Testcontainers)                                                                                                                          |
| `pnpm test:coverage`                           | tests with 100% thresholds on server and shared                                                                                                                                    |
| `pnpm lint` / `pnpm format`                    | ESLint (type-aware) / Prettier                                                                                                                                                     |
| `pnpm typecheck`                               | tsc across the workspace                                                                                                                                                           |
| `pnpm build`                                   | compile shared, server and web to their `dist/`                                                                                                                                    |
| `pnpm db:generate`                             | generate a migration from `apps/server/src/db/schema.ts`                                                                                                                           |
| `pnpm db:migrate`                              | apply migrations to `DATABASE_URL`                                                                                                                                                 |
| `pnpm db:up` / `pnpm db:down`                  | start / stop the compose Postgres                                                                                                                                                  |
| `pnpm ingest feed day\|week`                   | one feed sync, including detail fetches                                                                                                                                            |
| `pnpm ingest details`                          | one detail pass over pending candidates (`--limit N`, `--by-magnitude`)                                                                                                            |
| `pnpm ingest backfill --from DATE [--to DATE]` | load history newest first, freezing settled windows; `--days N` for a recent range, `--min-magnitude M` or `--all-magnitudes`, `--bbox`, `--force`, `--skip-details`, `--pause-ms` |
