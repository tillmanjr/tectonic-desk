# Volcano data for Tectonic Desk: research report

Research report, 2026-10-17. Prepared by a research agent for discussion; not a spec. All
fetches were made on 2026-10-16 unless marked "not verified". Note: `volcano.si.edu` (GVP's
HTML site, Weekly Report, RSS, webservices docs) returned Cloudflare 403 "Smithsonian site
temporarily unavailable" for every path, from both WebFetch and curl with a browser UA. GVP's
GeoServer on `webservices.volcano.si.edu` was fully reachable, so the data side is fine; the
WVAR HTML/RSS could not be verified that day.

## 1. Sources and services

### Smithsonian GVP (global, authoritative catalogue): verified (WFS)

- WFS 2.0 at
  `https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&typeName=...`.
  GetCapabilities states Fees NONE, AccessConstraints NONE; no auth, no visible rate limit, no
  cache headers (sets a cookie; plain GET works). Supports `count`, `resultType=hits`,
  `CQL_FILTER`, outputs JSON/CSV/KML/SHAPE-ZIP.
- Layers and counts (verified):
  - `GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes`: 1214 features, 2.45 MB as JSON (3.4 s).
    Props: `Volcano_Number, Volcano_Name, Volcanic_Landform, Primary_Volcano_Type,
Last_Eruption_Year, Country, Region, Subregion, Geological_Summary, Latitude, Longitude,
Elevation, Tectonic_Setting, Geologic_Epoch, Evidence_Category,
Primary_Photo_Link/Caption/Credit, Major_Rock_Type`.
  - `GVP-VOTW:Smithsonian_VOTW_Pleistocene_Volcanoes`: 1452 features.
  - `GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions`: 11,089 features. Props: `Volcano_Number,
Eruption_Number, Activity_Type, ExplosivityIndexMax, ExplosivityIndexModifier,
StartEvidenceMethod, StartDateYear/Month/Day (+modifiers/uncertainty),
EndDateYear/Month/Day`. 37 eruptions with StartDateYear >= 2025.
  - `GVP-VOTW:E3WebApp_Eruptions1960`: 2248 eruptions since 1960 with `StartDate` (YYYYMMDD),
    `EndDate`, `ContinuingEruption` ("True"/"False"), `ExplosivityIndexMax`, `Activity_ID`.
    38 flagged ContinuingEruption=True (Erebus since 1972, Masaya 2015, Langila 2015 ...). This
    is the cleanest "currently erupting" signal.
  - `GVP-VOTW:E3WebApp_HoloceneVolcanoes`: 1214, adds `Within_5km/10km/30km/100km` population
    and `LastEruption` text.
  - `GVP-VOTW:E3WebApp_Emissions`: server error (`Invalid object name vrf.Emission`): broken.
- Weekly Volcanic Activity Report (WVAR): HTML at `https://volcano.si.edu/reports_weekly.cfm`,
  RSS at `https://volcano.si.edu/news/WeeklyVolcanoRSS.xml` (both 403 that day; NOT verified).
  Joint GVP/USGS product, published by 23:00 UTC Thursdays (moved from Wednesdays Jan 2026),
  ~16 volcanoes/week, split "New Activity/Unrest" (after >= 3 months quiescence) vs "Ongoing
  Activity". Inclusion criteria: observatory alert change, VAAC advisory, verifiable news, or
  observer-reported significant change; long-running continuous eruptions and seafloor activity
  are mostly excluded. No structured endpoint; the RSS gives title/link/HTML description per
  volcano, which you would parse for the `vn=` number in the link.
- Licence: Smithsonian terms (non-commercial, attribution required); cite VOTW v5.3.0 DOI
  10.5479/si.GVP.VOTW5-2025.5.3. Database releases are periodic (v5.3.0 Jul 2025), so the WFS
  changes rarely; refreshing weekly is plenty.

### USGS Volcano Hazards Program (US only): verified

- HANS public API, `https://volcanoes.usgs.gov/hans-public/api/volcano/...` (JSON, CORS `*`,
  no auth, no rate limit stated; resources page warns docs are limited and endpoints may
  change). Verified:
  - `getElevatedVolcanoes`: 4 records: `obs_fullname, obs_abbr, volcano_name, vnum,
notice_type_cd, notice_identifier, sent_utc, sent_unixtime, color_code, alert_level,
notice_url, notice_data` (Great Sitkin WATCH/ORANGE, sent 2026-10-16 19:14 UTC).
  - `getMonitoredVolcanoes`: 69 records, same shape plus `volcano_cd`; no lat/lon; some null
    vnum.
  - `getUSVolcanoes`: 170 records with `vnum, volcano_cd, latitude, longitude,
elevation_meters, region, nvews_threat, obs_*, icao_coordinates, boilerplate`.
  - `getCapElevated`: only ORANGE/WATCH or higher (2 that day); adds `latitude, longitude,
cap_expires, synopsis, pubDate, msgType`.
  - `getVolcano/{vnum|volcanoCd}`, `newestForVolcano/{vnum}` (returns `noticeHtml` of the
    latest VAN/VONA/update).
  - `getVolcanoesUS`, `getVonaAll`, `getVolcanoStatus` do not exist (error JSON).
  - CAP RSS `https://volcanoes.usgs.gov/hans-public/rss/cap/`: RSS 2.0, 2 items, public
    domain; no actual `cap:` namespace despite the name.
- VSC volcanoApi, `https://volcanoes.usgs.gov/vsc/api/volcanoApi/...` ("freely available ...
  designed to support USGS applications, no guarantee of continuing support"). Verified:
  `/geojson` (161 US volcanoes, FeatureCollection with `vnum, volcanoCd, obs, alertLevel,
colorCode, alertDate, colorDate, noticeSynopsis, nvewsThreat`, 117 KB; served as text/html),
  `/vhpstatus`, `/elevated` (4), `/volcanoesUS` (161), `/volcanoesGVP` (1470 worldwide basic
  rows: vnum, name, country, lat/lon, elevation, `obsAbbr`), `/volcano?vnum=`,
  `/regionstatus?lat1..long2`.
- Alert levels (NORMAL/ADVISORY/WATCH/WARNING, plus UNASSIGNED = insufficient monitoring) and
  aviation colour codes (GREEN/YELLOW/ORANGE/RED) are assigned separately; a VAN marks an
  alert-level change, a VONA a colour-code change. Most of the 161 US volcanoes are
  UNASSIGNED/UNASSIGNED.
- Notices are event-driven (weekly updates for elevated volcanoes); polling every 10 to 15 min
  is more than enough. Public domain.

### Regional observatories

- GeoNet (NZ), verified: `https://api.geonet.org.nz/volcano/val`, GeoJSON, 12 volcanoes,
  props `volcanoID, volcanoTitle, level (0-5), acc, activity, hazards`;
  `/volcano/quake/{volcanoID}`. CC BY 3.0 NZ, no auth, no stated limits. Uses NZ VAL 0-5 plus
  ICAO colour; `volcanoID` is a slug, no GVP number (needs a 12-row hand map).
- JMA, verified feed: Atom `https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml`
  (high-frequency earthquakes+volcanoes; 24 regular ashfall-forecast entries that day carrying
  JMA 5-level alert levels, e.g. Sakurajima level 3). Entries link to JMA XML products
  (`VFVO53`); Japanese only, JMA XML schema, no GVP numbers. Free, JMA terms (CC BY
  4.0-compatible).
- IMO (Iceland), verified HTML only: VONA table at
  `https://en.vedur.is/earthquakes-and-volcanism/volcanoes/vona-notifications/` (34 rows since
  Nov 2024; latest Bardarbunga yellow -> green 2026-06-15); aviation colour map refreshed
  09:00 UTC daily. No RSS/JSON found. Scrape or defer.
- INGV-OE (Etna/Stromboli): communiques and VONAs are PDFs/HTML on ct.ingv.it; pages fetched
  but content is JS-rendered; no feed found. Defer.
- Tokyo VAAC, verified: `https://ds.data.jma.go.jp/svd/vaac/data/` (no active VAAs that day;
  `vaac_list.html` for recent). Washington VAAC, verified:
  `https://www.ospo.noaa.gov/products/atmosphere/vaac/messages.html` (17 VAAs/24 h for 5
  volcanoes; 15-day list); each advisory has HTML text, JPEG, KML
  (`.../volcanoes/kml_files/REVENTADOR_ASH_202610162322.kml`) and IWXXM 3.0 XML
  (`.../volcanoes/xml_files/FVXX21_20261016_2322.xml`, verified: GML polygons, flight levels,
  `<name>REVENTADOR 352010</name>` carries the GVP number). `ssd.noaa.gov` no longer resolves;
  Anchorage VAAC host unreachable from here. No aggregated VAAC feed exists; nine centres, each
  different. VAAs issue every 6 h or sooner while ash is present.

### Thermal and gas

- MIROVA (Turin), verified HTML: `http://www.mirovaweb.it/NRT/` lists MODIS/VIIRS detections
  with VRP (MW) and Low..Extreme classes, last alert 2026-10-16 23:05 UTC; per-volcano pages
  use GVP numbers (`volcanoDetails_VIR.php?volcano_id=312070`). No API, no stated licence
  (research group, academic citation expected). Scrape only; defer.
- MODVOLC (HIGP): reachable only with TLS verification disabled (bad cert chain); CGI-era
  site, text hotspot dumps, no documented API. Defer.
- NASA GSFC SO2 (`https://so2.gsfc.nasa.gov/`) is imagery pages (OMI/OMPS/TROPOMI regions),
  no API. SACS (`https://sacs.aeronomie.be/`) issues e-mail SO2/ash alerts and NRT images; no
  feed. Copernicus CDSE: S5P L2 SO2 requires registration + OAuth token, big NetCDF granules;
  Sentinel Hub / openEO processing is the realistic path, well beyond a poller. Defer all gas
  products.

## 2. Data consistency

- Scales differ: USGS ground alert (4 levels + UNASSIGNED) and ICAO colour (4) are
  independent; NZ VAL is 0-5; JMA is 1-5 with keyword levels; Iceland publishes ICAO colour
  plus a separate ground "VALS" code; GVP has no alert scale at all, only report sections. Only
  the ICAO aviation colour code is roughly comparable across agencies, and even then
  observatories set it on different thresholds.
- Eruption records: GVP eruptions are reviewed and have year/month/day uncertainty modifiers,
  VEI with "?" modifiers, and open-ended `EndDate` for continuing eruptions;
  `ContinuingEruption` is updated on GVP's release cadence (months), so a volcano can be
  "erupting" in GVP long after an observatory dropped to Normal. Conversely a Watch for unrest
  (Great Sitkin's slow dome growth) may appear in GVP only as "Ongoing Activity".
- Lags: WVAR is weekly and preliminary; USGS notices are minutes; VAAs are hourly; GVP
  database releases are quarterly-ish; GVP Bulletin narratives trail by months.
- Join keys: GVP `Volcano_Number` is the universal key. USGS uses it verbatim as `vnum`
  (string) alongside its own `volcano_cd` (e.g. `ak111`); VAAC IWXXM volcano names carry the
  number; MIROVA uses it as `volcano_id`; GeoNet and JMA need hand maps. USGS `volcanoesGVP`
  has 1470 rows vs 1214 Holocene GVP points (USGS includes Pleistocene/other US features), so
  use GVP as the base and left-join status.

## 3. Representation for a geologist

- Global base layer: 1214 Holocene volcanoes as small triangles, encoded by
  `Primary_Volcano_Type` (shape/outline) and `Last_Eruption_Year` bins (fill), over the
  existing PB2002 boundaries; `Tectonic_Setting` makes a good filter (subduction/rift/
  intraplate, crust type). Pleistocene layer as an optional toggle.
- Status overlay: a ring for USGS alert level/colour (US), GeoNet VAL (NZ); a distinct
  "continuing eruption" marker from E3 for the rest of the world; recent-VAA badge where a VAAC
  advisory exists in the last 24 h/15 d. Keep these visually separate rather than merging into
  one fake global scale.
- Detail panel: GVP summary, type, landform, rock type, tectonic setting, elevation, evidence
  category; eruption history as a VEI-vs-time strip (bar height = VEI, open bar for continuing,
  hatched for "?" modifiers, grouped by `Eruption_Number`); current observatory status with the
  latest notice synopsis and link; WVAR entries for that volcano; latest VAA polygon (the US
  West Coast view would show St. Helens' advisory from that day).
- Time: WVAR week is the natural tick for a "what changed" panel; eruption timeline spans the
  Holocene with a log-ish or zoomable axis since most records are post-1800 (observation bias;
  say so in the UI). Noisy/misleading: plotting all 11k eruptions on the map, treating
  UNASSIGNED as Green, showing MIROVA VRP without cloud-cover context, counting routine
  ashfall forecasts (Sakurajima daily) as events, and mixing agency scales.

## 4. Recommended first scope

Ingest (new `volcanoes` ingest behind the same `INGEST_ENABLED`):

1. Static-ish reference, generator script, checked in like geo files: GVP Holocene volcanoes
   (2.4 MB GeoJSON -> ~1 MB after dropping photo captions), Holocene eruptions (11k rows), E3
   Eruptions1960 (for ContinuingEruption). Refresh manually or weekly job; store `gvp_release`.
2. Polled: HANS `getElevatedVolcanoes` + `getMonitoredVolcanoes` + `getUSVolcanoes` every
   15 min (tens of KB), keep a status history table keyed by `vnum` + `sent_utc`; GeoNet
   `volcano/val` every 15 min (12 rows). Both are small, CORS-open, licence-clean.
3. Weekly: WVAR RSS every 6 h, dedupe by (volcano number, report week), store title + HTML
   body. Needs confirmation once volcano.si.edu is reachable again; if Cloudflare keeps
   blocking non-browser clients, fetch with a browser UA and alert on 403.

Volumes: < 5 MB static, < 1 MB/day polled.

Defer: VAAC (per-centre scraping, IWXXM parsing; Washington is doable later via the 15-day
HTML + XML), JMA XML, IMO scrape, INGV, MIROVA/MODVOLC, all SO2/Sentinel products, Pleistocene
layer.

## Sources

- https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetCapabilities
- https://volcano.si.edu/reports_weekly.cfm (403 that day)
- https://volcano.si.edu/news/WeeklyVolcanoRSS.xml (403 that day)
- https://volcano.si.edu/gvp_termsofuse.cfm ; https://volcano.si.edu/gvp_cite.cfm
- https://volcanoes.usgs.gov/hans-public/api/volcano ; /api/other ; /api/map ; /hans-public/resources
- https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes ; getMonitoredVolcanoes ; getUSVolcanoes ; getCapElevated ; getVolcano/311120 ; newestForVolcano/311120
- https://volcanoes.usgs.gov/hans-public/rss/cap/
- https://volcanoes.usgs.gov/vsc/api/volcanoApi (and /geojson, /vhpstatus, /elevated, /volcanoesUS, /volcanoesGVP)
- https://www.usgs.gov/programs/VHP/volcanic-alert-levels-characterize-conditions-us-volcanoes
- https://api.geonet.org.nz/ ; https://api.geonet.org.nz/volcano/val
- https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml
- https://en.vedur.is/earthquakes-and-volcanism/volcanoes/vona-notifications/ ; https://en.vedur.is/weather/aviation/volcanic-hazards/
- https://www.ospo.noaa.gov/products/atmosphere/vaac/ ; .../vaac/messages.html ; .../vaac/volcanoes/xml_files/FVXX21_20261016_2322.xml
- https://ds.data.jma.go.jp/svd/vaac/data/
- http://www.mirovaweb.it/NRT/
- https://modis.higp.hawaii.edu/ (invalid TLS chain)
- https://so2.gsfc.nasa.gov/ ; https://sacs.aeronomie.be/
- https://documentation.dataspace.copernicus.eu/APIs/Token.html ; https://maps.s5p-pal.com/so2-7km-nrt
- https://www.ct.ingv.it/index.php/monitoraggio-e-sorveglianza/prodotti-del-monitoraggio/comunicati-vona
- https://www.usgs.gov/center-news/volcano-watch-global-edition (WVAR criteria summary)
