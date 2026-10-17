# Earthquake history for Tectonic Desk: how far back, what changes, what it costs

Research report, 2026-10-17. Prepared by a research agent for discussion; not a spec. ComCat
counts were taken from the live `fdsnws/event/1/count` endpoint on 2026-10-17 between 06:30 and
07:10 UTC, one request at a time with a 1 s pause; database sizes were measured on the dev
Postgres (`tectonic-postgres`, PostgreSQL 16.15) the same morning. Agency facts were read from
the agencies' own pages on 2026-10-16/17 unless marked "not verified". Reads of the production
droplet were not permitted in this session, so the 35 GB figure is the droplet's nominal disk,
not a measured free-space number.

## Summary and recommendation

- ComCat, the catalogue the dashboard already ingests, goes back to 1568 for the US and to 1904
  globally, but the pre-1973 global record in it is only what ISC-GEM, the Centennial catalogue
  and the `official`/`ushis` lists contribute: 71,365 events for 1900-1972 against 4.8 million
  since. Nothing else needs to be merged to show a century of M5.5+ or M4.5+ seismicity with
  moment tensors from 1976; the other catalogues (ISC Bulletin, ISC-GEM native, GHEC, NCEI,
  SCEDC/NCEDC, JMA, GCMT) are worth knowing about as references and future enrichments, not as
  a second ingest.
- The catalogue is not one dataset. It changes character at 1904, 1918, 1932 (SCSN), 1964
  (WWSSN/ISC), 1973 (PDE, `us` ids), 1976 (GCMT), 1981 (digital regional networks), ~1990
  (NEIC moment tensors, broadband), 2004 (ak135, Mww ramp-up) and 2012-13 (ComCat consolidation).
  Pre-1976 "mw" values are mostly proxy magnitudes regressed from Ms/mb; pre-1964 depths are
  mostly fixed; pre-1932 West Coast entries are intensity-based; and whole-decade event counts
  are dominated by network detection thresholds, not seismicity.
- Measured cost: the events table is 2,341 bytes per event on disk today (17.5 MB for 7,497
  rows including four indexes), but half of that heap is dead space from the five-minute feed
  rewriting `last_seen` on every row (162,870 updates on 7,497 rows). The logical row is
  945 bytes (704 of them the `raw` JSONB), so backfilled rows that never churn cost about
  1.3 KB each with indexes; use 2.5 KB as the pessimistic all-in figure. Mechanisms add about
  1.9 KB per moment-tensor row and only attach to a minority of events.
- Recommendation: backfill **global M2.5+ from 1900 plus everything ComCat holds before 1900**
  (about 1.08 million events, 1.4 GB clean / 2.9 GB pessimistic including mechanisms, 750 to
  1,500 page requests plus 65,000-80,000 detail fetches, half a day to a day at a polite rate
  as a one-off CLI run). It keeps the single M2.5 threshold the feed already uses, so there is
  no magnitude discontinuity in the UI, and it costs under a tenth of the droplet. Do not take
  "all magnitudes" globally (4.9 million events, 6.9-13.1 GB, at the limit of a 35 GB /
  1 GB-RAM box). West Coast all-magnitudes since 1980 (2.5 million events, 3.6-6.7 GB,
  250,000+ detail fetches for the first-motion mechanisms) is feasible later as a separate,
  bbox-scoped phase if the small-event layer earns a place in the West Coast view.

## 1. How far back, and from which sources

### 1.1 USGS ANSS ComCat (what we ingest today): verified

- Service: `https://earthquake.usgs.gov/fdsnws/event/1/` (FDSN event 1.x, service version
  2.8.1 on 2026-10-17). Formats quakeml (default), geojson, csv, kml, text. Parameters we rely
  on: `starttime`/`endtime` (default window is the last 30 days, so a `catalog=` query with no
  `starttime` returns nothing for a historical catalogue), `minmagnitude`, bbox, `orderby`
  (`time` is descending; `time-asc` is what the backfill uses), `limit` (1-20,000), `eventid`
  (returns all origins, magnitudes and products), `catalog`/`contributor`, `producttype`,
  `reviewstatus`, `updatedafter`, `includedeleted`, `includesuperseded`. `includearrivals` is
  "NOT CURRENTLY IMPLEMENTED".
- Hard cap: "The service limits queries to 20000". A query matching more returns HTTP 400 with
  "N matching events exceeds search limit of 20000"; `limit=20001` is also a 400. The `count`
  endpoint returns `{"count":N,"maxAllowed":20000}` and still reports N above the cap, with an
  `error` string attached, which is what the tables below used. A count over more than roughly
  a million rows fails on the server side: whole-catalogue and 2000s/2010s/2020s all-magnitude
  decade counts returned `Error 503 ... SQLSTATE[HY000]: General error: 1114 The table
  '/rdsdbdata/tmp/#sql...' is full`, and one returned a 504 from the gateway. Per-year counts
  of up to 202,143 events worked. Keep windows small.
- Rate limits: the docs page publishes no numeric rate, only that automated clients should
  prefer the real-time feeds. Responses are served through CloudFront with
  `cache-control: public, max-age=60`, CORS `*`. A January 2022 realtime-feeds list post is
  reported to say the FDSN service and feeds are rate limited and answer HTTP 429 (not
  verified: pipermail returned 503 on every attempt). Observed: a 1,000-event GeoJSON page is
  710,155 bytes uncompressed (710 bytes per feature) and took 0.24 s; a full 20,000-event page
  is therefore about 14 MB.
- Terms: USGS data are public domain ("may be used without restriction"); the requested credit
  is "(Product or data name) courtesy of the U.S. Geological Survey". No ComCat-specific terms
  page exists; the feed life-cycle policy link 404s.
- Coverage and what fills it. The availability table (its header says "as of October 20,
  2020", so ranges are stale at the recent end) lists per-catalogue spans: `official`
  1638-2012, `ushis` 1663-1980, `cdmg` 1856-1884, `eqh` 1867-1868, `uu` 1876-, `uw` 1882-,
  `iscgem` 1900-2010 (now to 2021), `iscgemsup` 1904-1972 (now to 2021), `ci` 1925-, `hv`
  1959-, `atlas` 1960-2013, `nc` 1966-, `us` (NEIC PDE) 1973-, `ak` 1975-, `gcmt` 1977-2016,
  `se` 1977-, `choy` 1992-2007, `duputel` 1996. Live per-catalogue counts on 2026-10-17
  (pre-1900 / 1900-1972): `ushis` 392 / 2,832; `official` 118 / 179; `uw` 8 / 1,698; `iscgem`
  0 / 15,171; `iscgemsup` 0 / 7,344; `ci` 0 / 18,760; `hv` 0 / 26,675; `nc` 0 / 304; `cent`
  0 / 41; `pde` 0 / 3. Whole-catalogue: `iscgem` 74,153 events (1904-04-04 Kresna to
  2021-12-31, consistent with ISC-GEM v12), `iscgemsup` 9,834, `official` 308, `cent` 41 (all
  1900-1903, M7+; the Centennial catalogue only plugs the gap before ISC-GEM starts).
  `application.json` lists 62 catalogue codes and 29 contributor codes, several of them
  obviously leaked event ids, so treat the list as advisory.
- The `us` catalogue page: NEIC PDE is "Preliminary" because the ISC Bulletin is the final
  archive; January 1964 to January 1981 exists on scanned paper only, February 1981 to July
  2013 as monthly PDE files, weekly since August 2013; the velocity model changed from
  Jeffreys-Bullen to ak135 on 2004-01-01. The first PDE event in ComCat is `usp0000001`
  (1973-01-01, mb 5.3).
- Preferred origin/magnitude: products are weighted (base 1, +5 if the product source equals
  the event source, +100 if the author is authoritative for the region, +50 if it refers to
  an authoritative event); the heaviest wins, ties go to the latest update. `net` is the
  authoritative network of the preferred origin, `ids` and `sources` carry every merged id and
  network with leading and trailing commas.
- Pre-1900 and early entries look like this (live queries): `ushis15680101000000000` (1568
  Moodus CT, M4.9 "mw"), `official16150908030000000` (1615, 7.5 `mint`), `ushis16270101000000000`
  (1627 Essex MA, `mag: null`, `type: "not existing"`), `official16380611190000000` (1638, 6.5
  `mlg`), `ushis92` (1857 Fort Tejon, 7.93 "mw", depth `null`, `types`
  `earthquake-name,general-link,impact-text,origin`), `cdmg18990416134000000` (1899 Trinidad CA,
  7.0 `ms`, `ids ,cdmg18990416134000000,ushis351,`). The 1904-1929 slice is almost entirely
  `iscgem`/`iscgemsup` (`iscgemsup` rows carry `mag: null`), plus `ushis` with `magType` `fa`
  (felt area). The 1960 Valdivia entry is `official19600522191120_30` with
  `ids ,iscgem879136,official19600522191120_30,atlas19600522191117,` and `status: automatic`
  despite being curated. 1973 starts the `usp...` series with 33 km fixed depths and `mb`.

### 1.2 ISC Bulletin: verified (docs and service), event counts not verified

- Coverage: "from 1900 to present day". The Reviewed Bulletin is "typically 24 months behind
  real-time and is currently up to 2024-10-01". The 1964-2010 rebuild (ak135, current ISC
  locator) is complete (Storchak et al. 2017, 2020); no page states that 1904-1963 has been
  rebuilt, so treat that span as imported ISS/historical data. Database choices: "ISC Bulletin"
  (reviewed + unreviewed), "Reviewed ISC Bulletin", and "prime hypocentres only" versus all
  reported hypocentres. There is no "all" keyword; "all" is simply not ticking prime-only.
- Access: FDSN event service `https://www.isc.ac.uk/fdsnws/event/1/` (version 1.1.0; `catalog`
  only ISC; `contributor` = reporting agency and forces `includeallorigins`); formats QuakeML
  1.2, `isf`, `isf2`; `limit` default 40,000, no documented maximum. CGI searches give
  QuakeML/ISF 1.0/ISF 2.1 (Bulletin), CSV/QuakeML prime-only (event catalogue), focal
  mechanisms as QuakeML/CSV. No rate limit or cap is published anywhere found. EarthScope's
  `service.iris.edu/fdsnws/event/1` proxy of ISC/NEIC was retired 2026-06-01 and now returns
  "This service has been retired"; do not build on it.
- Terms: no licence text; data "should always be cited" by academic, commercial and individual
  users: "International Seismological Centre (2026), On-line Bulletin,
  https://doi.org/10.31905/D808B830" plus the procedure papers. ISC `evid` integers are what
  ComCat wraps as `iscgem<evid>`.

### 1.3 ISC-GEM Global Instrumental Earthquake Catalogue: verified

- Version 12.1 (27 Nov 2025; v12.0 of 19 Aug 2025 extended coverage to end-2021), about 74,100
  events, 1904-2021. v1.0 (Jan 2013, ~20,000 events) selection cut-offs were Ms >= 7.5 for
  1900-1917 (plus smaller continental events), Ms >= 6.25 for 1918-1959, Ms >= 5.5 for
  1960-2009; later versions added events below those floors (sub-7.5 for 1904-1919 in v5,
  sub-6.25 for 1920-1959 in v2-v4, continental Mw 5.0-5.5 from 1964 in v6-v8, GCMT Mw 5.0-5.5
  1976-2018 in v10, "Mw down to 5.0 globally" for 2020-2021). 1900-1903 was dropped for lack of
  reliable station data, hence the 1904 start. ISC stresses these are selection thresholds,
  "not completeness levels".
- Format: CSV main catalogue plus a supplementary catalogue (events large enough but with
  highly uncertain location or magnitude; this is ComCat's `iscgemsup`) and KMZ, via a request
  form. Licence CC BY-SA 3.0 Unported, copyright ISC and GEM Foundation; DOI 10.31905/D808B825;
  cite Storchak et al. 2013/2015, Di Giacomo et al. 2018, Bondár et al. 2015. ComCat already
  mirrors it, so there is no need to load the CSV unless the supplementary flags or formal
  uncertainties (not carried in ComCat) are wanted.

### 1.4 Pre-instrumental and significant-event catalogues: verified

- GEM Global Historical Earthquake Catalogue (GHEC v1.0, 1000-1903, Mw >= 7, from the GHEA
  archive; the only release, now maintained by INGV). ASCII text and KMZ at
  `https://www.emidius.eu/GEH/download/GEM-GHEC-v1.txt`. Licence CC BY-SA 3.0 (file header);
  GEM's product page variously says CC BY-SA 4.0 and CC BY-NC-SA 4.0; the 3.0 text shipped with
  the file governs. DOI 10.13127/ghea; cite Albini et al. 2013, 2014. Event count not stated
  (not verified).
- NOAA NCEI/WDS Global Significant Earthquake Database (2150 BC-present, DOI 10.7289/V5TD9V7K):
  inclusion if deaths, roughly $1M damage, M >= 7.5, MMI >= X or a tsunami. Undocumented but
  working JSON API
  `https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/earthquakes?minYear=&maxYear=&minEqMagnitude=&itemsPerPage=&page=`
  returning `{items, page, totalPages, itemsPerPage, totalItems}`; 6,697 items on 2026-10-17,
  first record 2150 BC Jordan. Fields include year/month/day/hour/minute/second, location name,
  lat/lon, depth, `eqMagnitude` plus Mw/Ms/Mb/unknown variants, intensity, deaths, damage,
  tsunami link. "Access to this dataset is unrestricted", US Government work, citation
  requested. Useful as an impact overlay, not as a catalogue.
- US historical: `ushis` is Stover & Coffman 1993 (USGS PP 1527, "Seismicity of the United
  States 1568-1989"), principal events MMI >= VI or M >= 4.5 (>= 5.5 in Alaska and offshore
  CA/OR/WA west of 126 W), times converted to UTC, epicentres by judgment or from felt area,
  Mfa magnitudes from felt area for eastern events, and arbitrary intensity-equivalent
  magnitudes for mapping (West: MMI VI = 5.0, VII = 5.5, VIII = 6.0, IX = 6.5, X-XII = 7.0; East
  0.5 lower). `cdmg` is Toppozada/CGS California history (its ComCat page 404s). `official` is
  the Earthquake Magnitude Working Group list, reviewed annually by NEIC.

### 1.5 Regional catalogues: verified

- SCEDC (Southern California): Caltech/USGS catalogue 1932-present (one 1925 Santa Barbara row);
  2019 Ridgecrest "remains largely unreviewed below M2.5". FDSN event
  `https://service.scedc.caltech.edu/fdsnws/event/1/` (1.1.1; QuakeML, text; catalogues SCSN
  default plus DS2000, HAUK2003/2004, SHLK2005, YHS2011 relocated sets; `includemechanisms`
  extra; no numeric cap, only "Please limit your search to smaller time periods"). Bulk: AWS
  Open Data `s3://scedc-pds` (us-west-2) with yearly catalogue text files 1932-present, phases,
  miniSEED, updated daily. Citation DOI 10.7909/C3WD3xH1; no licence text.
- NCEDC (Northern California): NCSS catalogue 1966-present (first rows 1966-07-01 Cholame);
  BSL/BDSN 1910-2003; mechanism catalogue 1968-; double-difference 1984-; a composite ANSS/CNSS
  1898-2012. FDSN event `https://service.ncedc.org/fdsnws/event/1/` (1.2.0; catalogues NCSS,
  EGS, DD; xml/text/geojson; `limit` default 10,000, no stated max; `starttime` must be a full
  timestamp; slow, several 504s on the day). Citation DOI 10.7932/NCEDC.
- JMA (Japan): yearly hypocentre ZIPs 1983-2024 and multi-year files back to 1919-1950
  (pre-1923 records were lost in the Kanto fire; 1919-1922 were reconstructed from local
  observatories and released 2019-2020). Fixed-width text, English format docs, magnitude
  priority MJ > MD > MV; also via NIED Hi-net after registration. Terms: Japanese Government
  Public Data License 1.0, stated CC BY 4.0-compatible.
- EMSC/SeismicPortal: FDSN event from 1998, xml/text/json, `limit` max and default 20,000,
  CC BY 4.0 with a no-bulk-copy clause. GEOFON: SeisComP FDSNWS from 2007-08, CC BY 4.0, blocks
  IPs that poll "every few seconds".

### 1.6 Moment tensors

- GCMT: `jan76_dec25.ndk` holds 70,044 CMTs from 1976-01-01 (`M010176A`) to 2025-12-31;
  monthly files since 2005; QuickCMTs in `NEW_QUICK/qcmt.ndk` (401 for 2026 so far); pre-1976
  extras `deep_1962-1976.ndk` and `intdep_1962-1975.ndk`. Systematic for M > 5 with a 3-4 month
  delay, quick for M > 5.5. ndk is five 80-character lines per event. No licence; cite
  Dziewonski et al. 1981 and Ekström et al. 2012. In ComCat GCMT appears as the `gcmt`
  catalogue and, for 1976-1989, as `focal-mechanism` products (not `moment-tensor`).
- NEIC: routine MTs and first motions for mb > 5.7 already in 1980-1984 (Sipkin 1987); rapid
  body-wave MTs for mb >= 5.8 from May 1993 (not verified beyond the abstract); W-phase
  implemented in real time around 2008-09 (Hayes et al. 2009); Duputel et al. 2012 reprocessed
  815 Mw >= 6.5 events of 1990-2010 (`duputel` catalogue). Regional MTs: Berkeley since 1992
  (automatic ML >= 3.5, reviewed >= 4.0), SLU North America 1996-2024.

## 2. How the data changes going back in time

### 2.1 Break points

| Year | What changes |
| --- | --- |
| 1568-1899 | US `ushis`/`cdmg`/`official`: intensity-based epicentres (25 to 100+ km error), date-only or hour-only times stored as `00:00:00Z`, no depth, magnitudes assigned from felt area or MMI with ~0.3 unit error. 642 events in ComCat. |
| 1897-1903 | Milne network (40 stations by 1903). ComCat has 41 `cent` M7+ events for 1900-1903. |
| 1904 | ISC-GEM start (Gutenberg notepads, ISA bulletins, BAAS). Teleseismic locations from 6-16 stations with secondary gaps of 200-310 deg; median epicentre shifts on relocation 70-205 km; 880 of 1,110 events 1904-1919 had no prior depth. |
| 1918 | ISS begins (first global summary, no magnitudes). Median relocation shift ~100 km in the 1920s falling to ~20 km by the late 1950s. |
| 1932 | SCSN catalogue starts; Mc ~3.25 and stays there until the early 1970s; unconstrained depths held at 6 km (1,352 of 1,696 West Coast M >= 3.5 events of 1932-1949 sit at exactly 6 km). |
| 1942-49 | Berkeley produces a full instrumental catalogue and routine magnitudes. |
| 1940s | Global network disrupted: a visible dip in recorded events (1,444 M5.5+ versus 2,243 in the 1930s in ComCat). |
| 1961-65 | WWSSN deployed (111 stations by 1965); 1964 ISC founded; Centennial/ISC-GEM cut-off drops to 5.5; EHB-quality data start. Global M4.5+ per year steps from 359 (1963) to 600 (1964). |
| 1967 / 1969 | NCSN and PNSN authoritative catalogues start. |
| 1973 | PDE in ComCat (`usp0000001`); global M4.5+ per year steps from 887 (1972) to 3,015 (1973); fixed 33 km (34 % of 1969-2004 PDE shallow events) and 10 km (19 %) depths. |
| 1976 | GCMT begins; Mw becomes a measured quantity rather than a proxy for M > ~5.5. |
| 1977-81 | SCSN digital (CEDAR, CUSP); PDE machine-readable from Feb 1981; SCSN Mc reaches 1.8 in the early 1980s. |
| 1984-88 | IRIS/USGS GSN broadband. |
| 1990-93 | NEIC moment tensors (1,478 of 2,282 M6+ events 1990-2004 carry an MT product versus none before); Berkeley regional MTs 1992. |
| 2002-04 | USGS magnitude policy (2002); PDE moves to ak135 2004-01-01; global M4.5+ per year steps from ~5,000 to ~7,900 (2005). |
| 2008-09 | W-phase at NEIC; SCSN statewide ML recalibration (2008-01-01, 1992-2008 recomputed). |
| 2012-13 | ComCat replaces the ANSS composite catalogue; PDE goes weekly (Aug 2013); ISC-GEM v1 (Jan 2013). |
| 2015-16 | SCEDC depths relative to the WGS84 ellipsoid (negative depths possible); Mlr; Mww authoritative above ~5.0. |

### 2.2 Magnitude of completeness

Global, from Michael 2014 (ISC-GEM, shallow): Mc 7.7 for 1900-1917, 7.0 for 1918-1939, 6.8 for
1940-1954, 6.5 for 1955-1963, 6.0 for 1964-1975, 5.8 for 1976-2003, 5.7 for 2004-2009; deep
events 7.1 before 1964 and 5.7 after. Di Giacomo et al. 2015 put it at "complete down to Mw 5.6
starting from 1964". Centennial: M7.0 before the 1930s, M6.5 to 1963, M5.5 from 1964. For PDE,
mb is reported for ~99 % of events down to 5.0 but Ms for only 20-80 %; the usual working
assumption of mb ~4.5 completeness since the 1990s is consistent with the counts below but no
published Mc study was found for it (not verified).

The decade counts make the point without a study. Global M5.5+ per decade is flat at 4,400-5,200
from the 1970s on (the catalogue is complete there), M4.5+ grows from 25,842 (1970s) to 75,278
(2010s) as detection improves, and M2.5+ grows from 56,371 to 260,982. Whatever is plotted
below M5.5 before the 1990s is a detection history as much as a seismicity history.

West Coast: SCSN "ML 3.25 since 1932 and ML 1.8 since 1981" (Hutton et al. 2010), ~1.6 in the
best-covered areas, 1.3 after the 2008 ML recalibration; Northern California had no full
instrumental catalogue until 1942 and no routine magnitudes until the late 1940s; current NCSN
completeness ranges M1.0 (central Coast Ranges) to M2.6 (Klamaths); the 1995-08-01 NCSN rule
requiring >= 5 P readings, RMS < 0.5 s and gap < 235 deg for automatic locations affects
low-magnitude completeness; PNSN's authoritative catalogue starts in 1969 with earlier
1793-1929 and 1929-1969 historical lists. A 2020 SSA abstract finds California/Nevada complete
for M >= 4 since 1932; Felzer & Cao use M5.5 as the usable floor back to 1850. Note the West
Coast M2.5+ count peaks in the 1980s (29,759) and falls to 19,351 in the 2000s: Landers and
Northridge aftershocks plus the pre-2008 ML inflation (ML up to 0.5 above Mw at M4-5, corrected
by the 2008 recalibration and Mlr) move events across the 2.5 line.

### 2.3 Location, depth and time

- Pre-instrumental: 25 to 100+ km epicentre error; no depth; Stover & Coffman give no depths for
  most pre-1930 US events.
- 1904-1963: ISC-GEM formal median 90 % error-ellipse area 105 km2, median origin-time
  uncertainty 0.25 s, nominal 25 km depth uncertainty where no depth-phase stack exists; "in
  the historical period many event depths were fixed to the surface"; about one third of events
  were fixed to a regional default depth. For 1904-1919 only ~90 % of origin times agree with
  prior catalogues to within a minute and some were truncated to the minute; 87 of 850 global
  M6+ events of 1900-1917 have minute-only times in ComCat.
- 1964-1995: routine ISC/PDE hypocentres can be off by "several tens of kilometers" in location
  and depth (Engdahl et al. 1998); EHB relocations agree with ISC-GEM to a median 9 km.
- NEIC fixed depths: 33 km when the free solution went negative or was judged shallow, 10 km
  later; depths of exactly 33/10/0/15/5/35 km still account for 1,795 of 5,031 M5.5+ events in
  2015-2025 (mostly 10 km) and 2,455 of 6,057 in 1976-1989.
- Regional: SCSN nominal errors < 6 km for most M >= 3 events 1932-1973, < 3 km after 1973,
  sub-km for the 3D/double-difference relocated sets since 1981; station clocks were tied to
  shortwave radio until WWVB/GOES time codes and "some event times may be wrong due to bad WWVB
  time code" (1977-1981). Minute-only times: 285 of 351 West Coast events before 1932, 113 of
  1,696 in 1932-1949, 16 in 1970-1980, none after 2015.

### 2.4 Magnitude types across the decades

What `magType` actually contains in ComCat (live counts, 2026-10-16):

| Era, selection | Dominant `magType` values |
| --- | --- |
| 1900-1917, global M >= 6 | mw 704, ms 69, mb 63 (sources iscgem 548, iscgemsup 204, cent 36, official 33, ushis 20) |
| 1918-1963, global M >= 6 | mw 4,900 of 4,952; uk/unk 7 |
| 1964-1975, global M >= 5.5 | mw 4,292, mb 806, ms 391 |
| 1976-1989, global M >= 5.5 | mw 2,732, mb 2,141, ms 1,146 (magSource hrv 2,263) |
| 1990-2004, global M >= 5.5 | mwc 3,178, mw 2,440, mwb 1,135, mb 428, ms 148 |
| 2005-2014, global M >= 5.5 | mwc 2,370, mww 1,266, mwb 1,219, mb 408 |
| 2015-2025, global M >= 5.5 | mww 4,483, mb 314, mwb 116, mwc 42 |
| 1932-1949, West Coast M >= 3.5 | ml 1,540, mh 113 |
| 1970-1980, West Coast M >= 3.5 | ml 1,625, md 1,270 (NC and UW), mb 271 |
| 1993-2004, West Coast M >= 3.5 | ml 1,321, mw 404, md 396, mwr 19 |
| 2015-2025, West Coast M >= 3.5 | mw 994, ml 802, mlr 217, mwr 115 |
| pre-1900, US M >= 5 | ml 73, mw 70, mfa 21, mlg 6, mint 3, uk 2 |

The pre-1976 "mw" is overwhelmingly proxy: ISC-GEM v5 is 45.7 % GCMT Mw, 42.9 % proxy from
Ms, 8.1 % proxy from mb and 3.3 % literature values; before 1976 only 967-971 events have a
literature Mw. mb saturates around 6.5 and Ms20 around 8.3 (USGS magnitude-types page). Mww is
"Authoritative USGS magnitude if computed" (>= ~5.0), Mwr covers 4.0-6.5 regionally, Mfa is
felt-area mb, Mint is intensity-derived, Mh is a hand or temporary value. SCSN preferred Mw for
M >= 6 from 1932 (literature), Mw for M >= 5 since 2000, ML below, with Mca/Md/Mh as stopgaps;
Mlr = 0.853 ML + 0.401 since December 2015 because ML runs above Mw. For the UI this means a
single magnitude axis is honest only above M5.5 before 1976 and above ~M4.5 before the 1990s,
and `magType` should be shown next to historical magnitudes rather than hidden.

### 2.5 Moment tensors and focal mechanisms by era

ComCat products (live counts with `producttype`): M >= 6 events carry no moment tensor before
1990; for 1976-1989 GCMT is loaded as `focal-mechanism` (1,550 of 1,675 M6+); 1990-2004 1,478
of 2,282 have an MT (2,192 an FM); 2005-2014 1,590 of 1,649; 2015-2025 1,449 of 1,479. For
M >= 5.5: 0 of 6,057 MTs in 1976-1989 (4,781 FMs), 4,258 of 7,356 in 1990-2004, 4,906 of 5,327
in 2005-2014, 4,618 of 5,031 in 2015-2025. West Coast M >= 4: MTs 0 before 1981, 7 of 1,200 in
1981-1992, 268 of 697 in 1993-2004, 519 of 643 in 2015-2025; first-motion FMs already on 146 of
1,277 in 1970-1980. In the dev database today 110 of 129 M5.5+ events have a mechanism, 175 of
2,050 at M4.5-5.4, 82 of 2,254 at M3.5-4.4 and 161 of 3,064 below (nearly all `nc`/`ci`
first motions). Pre-1976 first-motion compilations (and the Yang/Hauksson/Shearer HASH
catalogue of ~179,000 quality SCSN mechanisms 1981-2010, 297,478 to 2021 in Cheng et al. 2023)
exist only as literature or SCEDC alternate catalogues, not as ComCat products. The
`planes_reconstructed` path matters for the 1976-1989 GCMT-as-FM products, which may carry axes
without nodal planes.

### 2.6 Pitfalls

- Duplicates and association: ComCat merges contributors into one event and lists them in
  `ids`/`sources`; unassociated near-duplicates still occur (the 2016 "Duplicate Fiji
  earthquakes" feed notice), events are deleted and sometimes undeleted (a deleted id answers
  409 unless `includedeleted`), and `includesuperseded` exposes older versions. Our upsert keys
  on the preferred id, so an event whose preferred id flips (regional id to `us` id, or to
  `iscgem` after an ISC-GEM reload) would appear twice; a historical backfill should dedupe on
  `ids` overlap, not just `id`.
- Preferred-magnitude switches: when NEIC adds an Mww it becomes authoritative, changing both
  value and type; 2019 Ridgecrest carries `ci` mw 7.1, `us` mww 7.1, `iscgem` mw 7.03 and
  tsunami-centre Mi values at 100 km depth. Across 1976-2004 roughly 400 M5.5+ events per decade
  have only an mb.
- Id formats and stability: `usp0000001`-`usp000jm6p` (1973-2012), `us20002kxa`/`us10008x9b`
  (2015-2017), `us6000eglq`/`us7000lrsg` (2020s), `ci3362686` (1935), `uw10855513` (1973),
  `iscgem895106`, `ushis92`, `cdmg18570109140000000`, `official19060418131226300_12` (a
  timestamp plus suffix). Regional ids are not stable in the first 15-20 minutes; historical ids
  change when a catalogue is reloaded (ISC-GEM events show `updated` 2022-04-26 or 2025-12-19 in
  bulk).
- `updated` is a product-load time, not a scientific revision: `usp0000001` says 2014-11-06;
  many 1990s PDE events say 2022-04/05 or 2025-12. Our `excluded.updated >= events.updated`
  guard therefore re-writes whole decades after an ISC-GEM or PDE reload, which is harmless but
  will show up as thousands of "updated" rows in a run.
- Dates pre-1900 are UTC conversions of local reports (the UTC date can differ from the
  textbook local date); many are stored as `00:00:00Z`.
- Null fields: `iscgemsup` and some `hv` rows have `mag: null` and `magType: null`; all
  pre-1930 US rows have `depth: null`; `nst`/`dmin`/`rms`/`gap` are null for everything not
  located by a modern regional network. The parser already tolerates these (`mag`, `depthKm`
  and `magType` are nullable), but the UI's magnitude scale and depth colouring need a "no
  value" state before any backfill.
- Coverage: global PDE before 1973 is not in ComCat except through `cent`/`iscgem`/`official`;
  `hv` (26,675 events 1959-1972) and `ci` (18,760 for 1932-1972) dominate the pre-1973
  all-magnitude counts, so a pre-1973 global map at low magnitude is a map of Hawaii and
  Southern California.

## 3. Storage and backfill cost

### 3.1 ComCat counts (live, 2026-10-17)

Global, by decade. Counts above 20,000 come from the `count` endpoint's `count` field, which the
service reports alongside its "exceeds search limit of 20000" error. The three starred
all-magnitude figures are sums of per-year counts because the decade-wide count failed with a
503 from the service's database.

| Decade | M5.5+ | M4.5+ | M2.5+ | All magnitudes |
| --- | ---: | ---: | ---: | ---: |
| 1900s | 402 | 463 | 509 | 638 |
| 1910s | 869 | 986 | 1,032 | 1,161 |
| 1920s | 1,697 | 1,914 | 1,922 | 2,423 |
| 1930s | 2,243 | 2,787 | 5,432 | 7,907 |
| 1940s | 1,444 | 1,694 | 4,838 | 7,416 |
| 1950s | 2,498 | 3,151 | 6,848 | 9,550 |
| 1960s | 3,849 | 4,965 | 12,750 | 21,675 |
| 1970s | 4,377 | 25,842 | 56,371 | 153,607 |
| 1980s | 4,384 | 39,764 | 102,801 | 508,782 |
| 1990s | 4,865 | 43,144 | 172,012 | 723,961 |
| 2000s | 5,160 | 60,560 | 258,582 | 1,021,791 * |
| 2010s | 4,898 | 75,278 | 260,982 | 1,372,846 * |
| 2020-10/2026 | 3,163 | 51,990 | 192,911 | 1,076,362 * |
| **1900-2026** | **39,849** | **312,538** | **1,076,990** | **4,908,119** |
| pre-1900 | | | | 642 |

The decade sums for M5.5+ and M4.5+ match the single-query totals (39,849 and 312,538) exactly.
Global M2.5+ since 1970 is 1,043,659. The single-query M2.5+ since 1970 and all-magnitude totals
both failed with 503, as did every all-magnitude decade after 1999; per-year all-magnitude counts
run 76,970 (2000) to 202,143 (2020), with 112,098 so far in 2026.

West Coast bbox (lat 30-50, lon -130 to -110), by decade:

| Decade | M4.5+ | M2.5+ | All magnitudes |
| --- | ---: | ---: | ---: |
| 1900s | 40 | 45 | 65 |
| 1910s | 78 | 90 | 124 |
| 1920s | 84 | 85 | 100 |
| 1930s | 295 | 2,925 | 4,716 |
| 1940s | 187 | 3,327 | 3,874 |
| 1950s | 437 | 3,993 | 4,555 |
| 1960s | 281 | 3,662 | 4,681 |
| 1970s | 488 | 14,652 | 70,878 |
| 1980s | 667 | 29,759 | 368,697 |
| 1990s | 396 | 28,895 | 475,805 |
| 2000s | 340 | 19,351 | 523,894 |
| 2010s | 361 | 22,769 | 714,928 |
| 2020-10/2026 | 258 | 14,888 | 445,238 |
| **1900-2026** | **3,912** | **144,441** | **2,617,555** |

West Coast M2.5+ since 1980 is 115,662 (single query, matches the decade sum); all magnitudes
since 1980 is 2,528,562 (decade sum; the single query 503'd).

Selected per-year global counts, to place the steps:

| Year | All | M4.5+ | | Year | All | M4.5+ |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| 1960 | 1,678 | 292 | | 1985 | 59,170 | 4,574 |
| 1963 | 1,925 | 359 | | 1990 | 60,557 | 4,430 |
| 1964 | 1,493 | 600 | | 1995 | 72,246 | 4,702 |
| 1968 | 3,054 | 722 | | 2000 | 76,970 | 5,010 |
| 1970 | 5,958 | 669 | | 2005 | 113,521 | 7,878 |
| 1972 | 5,454 | 887 | | 2010 | 126,972 | 7,214 |
| 1973 | 10,021 | 3,015 | | 2015 | 127,306 | 7,153 |
| 1976 | 18,053 | 3,631 | | 2020 | 202,143 | 6,511 |
| 1980 | 29,447 | 3,515 | | 2025 | 140,335 | 8,558 |

Paging implication: at M4.5+ no single year exceeds 8,558 events, so one 20,000-event page per
year would do; at M2.5+ no month exceeds the cap in the decade averages (about 2,200 a month in
the 2010s), so the existing 30-day windows need no paging except after the largest sequences;
all-magnitude West Coast months do exceed 20,000 around Landers (1992), Northridge (1994) and
Ridgecrest (2019), and global all-magnitude months run 10,000-20,000 through the 2010s-2020s,
so those scopes lean on the cursor paging inside `loadWindow`.

### 3.2 Bytes per event, measured on the dev database

Table sizes (`pg_total_relation_size`, bytes):

| Table | Total | Heap | Indexes | TOAST | Live rows | Dead rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| events | 17,547,264 | 15,335,424 | 2,170,880 | 8,192 | 7,497 | 889 |
| mechanisms | 1,433,600 | 1,236,992 | 163,840 | 8,192 | 720 | 46 |
| ingest_runs | 327,680 | 147,456 | 147,456 | 8,192 | 1,156 | 6 |
| volcano_status | 114,688 | 16,384 | 65,536 | 8,192 | 81 | 0 |
| volcano_reports | 32,768 | 0 | 24,576 | 8,192 | 0 | 0 |
| database (`pg_database_size`) | 27,737,111 | | | | | |

Events indexes: `events_lat_lon_idx` 647,168, `events_pkey` 565,248, `events_mag_idx` 540,672,
`events_time_idx` 417,792 (290 bytes per event together). The 7,497 events span 2026-07-15 to
2026-10-17 (the 90-day M2.5+ backfill of 2026-10-13 plus the feeds); 7,485 are M2.5+, 2,179
M4.5+; 528 events carry 720 mechanism rows.

Column sizes (`pg_column_size`, averages over all events): whole tuple 945 B; `raw` JSONB 704 B
(median 702, p95 742, min 586, max 878; 638 characters as text, so JSONB costs ~10 % over text
and nothing is TOASTed or compressed because every row is under the 2 KB threshold); everything
else 240 B, of which `types` 56 B and `place` 31 B; ids average 10.5 characters. `raw` is the
feed properties only (`detail` URL included for 7,016 rows); products never enter `raw`.
Mechanisms: `mt` rows average 1,634 B (1,378 B of it `raw`), `fm` rows 906 B (762 B `raw`),
plus 228 B of indexes per row.

Derived:

| Figure | Bytes per event | Basis |
| --- | ---: | --- |
| Measured on disk, events table incl. indexes | 2,341 | 17,547,264 / 7,497 |
| Measured on disk, plus mechanisms amortised | 2,532 | + 1,433,600 / 7,497 |
| Logical tuple (data + 24 B header + 8 B line pointer) | ~977 | 945 + 32 |
| Clean estimate with indexes | 1,100-1,300 | ~1.0 KB heap + 0.1-0.3 KB btree entries |
| Planning figures used below | 1,300 (clean), 2,500 (pessimistic) | |

The gap between 977 and 2,045 bytes of heap per live row is churn, not data: `pg_stat_user_tables`
shows 162,870 updates on 7,497 rows (21.7 per row, 60 % HOT), because `upsertEvents` bumps
`last_seen` for every event in every feed batch and the day feed runs every few minutes. Rows
loaded once by a backfill never see that, so the clean figure applies to them. The same churn
inflates the indexes. (Worth fixing independently: bump `last_seen` only when it moves by more
than, say, an hour, or drop the separate UPDATE; it would roughly halve the live table.)

Wire size for the backfill: 710 bytes per feature uncompressed (the client does not request
gzip), so one million events is about 0.7 GB of transfer.

### 3.3 Candidate scopes

Mechanism rows are estimated from the measured attach rates (85 % of M5.5+, 8.5 % of M4.5-5.4,
3.6 % of M3.5-4.4, ~5 % below, 1.4 rows per event, 1.9 KB per `mt` and 1.1 KB per `fm` row with
indexes), applied only from 1976 on. Detail requests are one per event whose `types` advertises a
mechanism; the mechanism counts measured in 3.4 bound them. Request time assumes one request
per second for pages and the current detail concurrency of 2 at roughly one fetch per second
each; add Postgres time on the 1 vCPU droplet (a 20,000-row chunked upsert will take tens of
seconds there) and the ~14 MB per full page of transfer.

| Scope | Events | Events, clean / pessimistic | Mechanisms (approx.) | Total | Page requests | Detail requests | Wall time (polite) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A. Global M5.5+ since 1900 | 39,849 | 0.05 / 0.10 GB | ~0.08 GB | 0.13-0.18 GB | 127 yearly or 1,521 monthly | ~28,000 | 4-8 h |
| B. Global M4.5+ since 1900 | 312,538 | 0.41 / 0.78 GB | ~0.13 GB | 0.5-0.9 GB | 127 yearly or 1,521 monthly | 30,000-50,000 | 5-14 h |
| C. Global M2.5+ since 1970 | 1,043,659 | 1.36 / 2.61 GB | ~0.16 GB | 1.5-2.8 GB | ~700 monthly | 65,000-80,000 | 10-22 h |
| D. Global M2.5+ since 1900 + all pre-1900 (recommended) | 1,077,632 | 1.40 / 2.69 GB | ~0.16 GB | 1.6-2.9 GB | ~1,520 monthly (or yearly before 1970) | 65,000-80,000 | 10-24 h |
| E. West Coast all magnitudes since 1980 | 2,528,562 | 3.29 / 6.32 GB | ~0.3-0.4 GB | 3.6-6.7 GB | ~620 (monthly + paging) | 250,000-350,000 (see 3.4) | 2-4 days |
| F. Everything ComCat has | 4,908,761 | 6.38 / 12.27 GB | ~0.5-0.8 GB | 6.9-13.1 GB | ~2,500 (monthly + paging) | 400,000+ | 4-7 days |

Against the droplet (nominal 35 GB; assume 6-8 GB for Ubuntu, Docker images, the 1 GB swap file
and logs, which was not measurable in this session): A-D stay under 3 GB and leave the box as
it is; E roughly doubles the row count and would push the database to 4-7 GB, acceptable on disk
but with 1 GB of RAM most of the time and lat/lon indexes stop fitting in shared buffers, so
map-window queries over the West Coast would hit disk; F lands at 7-13 GB for the tables alone,
before WAL (1 GB default `max_wal_size`), autovacuum headroom and any `pg_dump` or
`REINDEX`, which needs a second copy of the largest index, so it is not advisable on this
droplet.

### 3.4 Mechanism-product counts (drives the detail phase)

Live `count` calls with `producttype=` (2026-10-17), i.e. the number of events the detail phase
would fetch:

| Selection | focal-mechanism | moment-tensor |
| --- | ---: | ---: |
| West Coast M2.5+, 1980s | 6,374 | 0 |
| West Coast M2.5+, 1990s | 5,700 | 333 |
| West Coast M2.5+, 2000s | 4,906 | 683 |
| West Coast M2.5+, 2010s | 6,892 | 1,452 |
| West Coast M2.5+, 2020-10/2026 | 5,500 | 1,230 |
| West Coast all magnitudes, 2015 | 8,451 | |
| West Coast all magnitudes, 2024 | 6,364 | |
| Global M2.5+, 2015 | 624 | 1,606 |
| Global M4.5+, 2015 | 2 | 909 |
| Global M4.5+, 1995 | | 56 |
| Global M4.5+, 1985 | 686 | |

Reading: a quarter of West Coast M2.5+ events since 1980 (29,372 of 115,662) carry a
first-motion mechanism from `nc`/`ci`, and below M2.5 the networks attach them to 6,000-8,500
events a year, so scope E means 250,000-350,000 detail fetches (two to four days at one or two
per second) and roughly 0.3-0.4 GB of `fm` rows; that is where the estimate in the table comes
from. Globally about 2,200 M2.5+ events a year carry a product today (8-9 % of M2.5+, 13 % of
M4.5+), ~700 a year in the 1980s (GCMT as `focal-mechanism`), and strikingly few in the
mid-1990s (56 M4.5+ events of 1995 have a `moment-tensor` product, against 909 in 2015), so
the global scopes need 65,000-80,000 detail fetches and the 1990s will show fewer beachballs
than the 1980s unless GCMT's ndk file is loaded directly for that decade (a later enrichment,
not part of this backfill).

### 3.5 What a historical backfill needs from the code

- It is a one-off CLI run, not a feed job. `pnpm ingest backfill --days N` exists
  (`apps/server/src/ingest-cli.ts` -> `backfill()` in `apps/server/src/ingest/backfill.ts`): it
  walks `--window-days` (default 30) windows from `now - days` to now, pages each window with
  `orderby=time-asc&limit=20000` restarting at the last event's time, upserts, then drains
  detail candidates 200 at a time with concurrency 2. `--days 46300` would reach 1900
  arithmetically, but the run would be 1,500 windows with no checkpoint: a failure near the end
  restarts from scratch, and the `ingest_runs` row records only the whole run.
- Needed additions: `--from/--to` instead of `--days`; `--min-magnitude` (the CLI hard-wires the
  2.5 default; `BackfillOptions.minMagnitude` already exists) and `--bbox` for scope E;
  per-window checkpoints (one `ingest_runs` row or a `detail` entry per window, resume from the
  last complete one); a configurable pause between page requests and a back-off on 429/503
  (the client has a 15 s timeout and no retry); request gzip; and a dedupe on `ids` overlap so
  a reloaded catalogue does not leave two rows for one event. Yearly windows before 1970 and
  monthly after would cut the request count for scope D from 1,520 to about 750.
- The detail phase dominates wall time for every scope: tens of thousands of single-event
  fetches. Order them by magnitude descending so the moment tensors that matter land first,
  and consider skipping `focal-mechanism`-only candidates below M3.5 for the global scopes.
- Run it on the droplet (inside the server container, `INGEST_ENABLED=false` on a second
  instance, or simply while the feeds run; the backfill has its own lane) or from the dev
  machine with `DATABASE_URL` tunnelled; either way it is the Postgres write rate on 1 vCPU
  that sets the pace for the page phase, not ComCat.
- After loading, `VACUUM (ANALYZE)` and check `pg_total_relation_size` against the clean figure
  above; if the live table is far above it, the `last_seen` churn fix is overdue.
- UI consequences before shipping any of it: the status line and catalogue stats assume a
  90-day window; the magnitude and depth encodings need a null state; and the time slider or
  window picker has to make the detection-threshold steps of 2.2 visible rather than letting a
  1930s map look quiet.

## Sources

USGS / ComCat

- https://earthquake.usgs.gov/fdsnws/event/1/ ; /version ; /application.json
- https://earthquake.usgs.gov/fdsnws/event/1/count?format=geojson&starttime=...&endtime=...[&minmagnitude=...][&minlatitude=30&maxlatitude=50&minlongitude=-130&maxlongitude=-110] (91 decade, 8 total and 53 per-year calls, 2026-10-17)
- https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2024-01-01&endtime=2024-02-01&minmagnitude=2.5&orderby=time-asc&limit=1000 (page-size measurement)
- https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=1900-01-01&endtime=1930-01-01&orderby=time&limit=6 ; ...starttime=1960-05-22&endtime=1960-05-23&orderby=magnitude ; ...starttime=1973-01-01&endtime=1973-01-03 ; ...starttime=1850-01-01&endtime=1900-01-01 with the West Coast bbox ; ...starttime=1000-01-01&endtime=1900-01-01&orderby=time-asc
- https://earthquake.usgs.gov/data/comcat/ ; /availability.php ; /catalog/ ; /contributor/ ; /catalog/us/ ; /catalog/ushis/ ; /catalog/official/ ; /catalog/iscgem/ ; /catalog/iscgemsup/ ; /products.php
- https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php
- https://www.usgs.gov/information-policies-and-instructions/acknowledging-or-crediting-usgs
- https://www.usgs.gov/programs/earthquake-hazards/magnitude-types
- https://geohazards.usgs.gov/pipermail/realtime-feeds/2022-January/000028.html (429 notice; unreachable, not verified)
- https://pypi.org/project/usgs-libcomcat
- https://pubs.usgs.gov/pp/1527/report.pdf (Stover & Coffman 1993)
- https://pubs.usgs.gov/of/1993/0606a/report.pdf (PDE 33 km depth restriction)
- https://pubs.usgs.gov/publication/70137462 (Michael 2014, ISC-GEM completeness)
- https://pubs.usgs.gov/publication/70014167 (Sipkin 1987) ; https://pubs.usgs.gov/publication/70036371 (Hayes et al. 2009) ; https://www.usgs.gov/publications/w-phase-source-inversion-moderate-large-earthquakes-1990-2010
- https://pubs.usgs.gov/of/2007/1437/h/of2007-1437h.pdf (Felzer & Cao 2008)
- https://pubs.usgs.gov/fs/2011/3065/pdf/FS11-3065.pdf (WWSSN/GSN history)
- https://webharvest.gov/peth04/20041117163903/http:/earthquake.usgs.gov/scitech/centennial/ (Centennial catalogue)
- https://arxiv.org/pdf/physics/0703241 (NEIC 1969-2004 depth and magnitude statistics)

ISC, GEM, GCMT

- https://www.isc.ac.uk/iscbulletin/ ; /search/bulletin/ ; /search/catalogue/ ; /search/webservices/ ; /citing.php ; https://www.isc.ac.uk/citations/ ; https://www.isc.ac.uk/projects/rebuild/
- https://www.isc.ac.uk/fdsnws/event/1/ ; /version ; /catalogs
- https://www.isc.ac.uk/iscgem/ ; /overview.php ; /download.php ; /update_log/ ; /citing.php
- https://essd.copernicus.org/articles/10/1877/2018/ (Di Giacomo, Engdahl & Storchak 2018)
- https://real.mtak.hu/20760/1/isc2.pdf (Bondár et al. 2015) ; https://real.mtak.hu/20830/ (Di Giacomo et al. 2015)
- https://www.seismosoc.org/Publications/srl/SRL_84/srl_84-5_es/srl_84-5_es.pdf (Storchak et al. 2013)
- https://www.emidius.eu/GEH/ ; https://emidius.eu/GEH/license.php ; https://www.emidius.eu/GEH/download/GEM-GHEC-v1.txt ; https://www.globalquakemodel.org/product/ghea
- https://www.globalcmt.org/ ; /CMTfiles.html ; /CMTcite.html ; https://www.ldeo.columbia.edu/~gcmt/projects/CMT/catalog/allorder.ndk_explained ; .../jan76_dec25.ndk ; .../NEW_QUICK/qcmt.ndk
- https://earthjay.com/earthquakes/20160729_mariana/Engdahl_etal_1998_teleseismic_EQ_relocation.pdf (EHB)

NOAA, regional networks, others

- https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.hazards:G012153 ; https://www.ncei.noaa.gov/products/natural-hazards/tsunamis-earthquakes-volcanoes/earthquakes ; https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/earthquakes?itemsPerPage=1
- https://scedc.caltech.edu/eq-catalogs/index.html ; https://scedc.caltech.edu/data/cloud.html ; https://scedc.caltech.edu/about/citation.html ; https://service.scedc.caltech.edu/fdsnws/event/1/ ; https://local.scedc.caltech.edu/eq-catalogs/change-history.html
- https://ncedc.org/ncedc/catalog-search.html ; https://ncedc.org/pub/catalogs/README ; https://service.ncedc.org/fdsnws/event/1/ ; https://ncedc.org/ncsn/ncsn.overview.html ; https://www.ncedc.org/blog/1995/08/01/change-in-ncsn-earthquake-catalog.html
- https://pnsn.org/events/historic-catalog ; https://assets.pnsn.org/CASCAT2006/about.html
- https://seismo.berkeley.edu/mt/ ; https://www.eas.slu.edu/eqc/eqc_mt/MECH.NA/index.html
- https://authors.library.caltech.edu/17934 (Hutton, Woessner & Hauksson 2010) ; https://central.scec.org/publication/1408 (Thormann et al. 2010) ; https://igppweb.ucsd.edu/~shearer/mahi/PDF/2012/yang_focal_2012 ; https://scedc.caltech.edu/data/alt-2011-yang-hauksson-shearer.html
- https://www.data.jma.go.jp/svd/eqev/data/bulletin/index_e.html ; /hypo_e.html ; /catalog/notes_e.html ; /notice/20200116/20200116_e.html ; https://www.jma.go.jp/jma/en/copyright.html ; https://hinetwww11.bosai.go.jp/auth/JMA/?LANG=en
- https://www.seismicportal.eu/fdsn-wsevent.html ; https://www.seismicportal.eu/terms.html
- https://geofon.gfz.de/fdsnws/event/1/ ; https://geofon.gfz.de/eqinfo/faq/
- https://ngf.earthscope.org/news/retirement-fdsnws-event-web-service ; https://ds.iris.edu/ds/nodes/dmc/services/usage/
- https://seismosoc.secure-platform.com/a/solicitations/9/sessiongallery/204/application/5468 (California/Nevada completeness since 1932)

Local measurements

- `docker exec tectonic-postgres psql -U tectonic -d tectonic` on 2026-10-17: `pg_total_relation_size`, `pg_relation_size`, `pg_indexes_size`, `pg_stat_user_tables`, `pg_stat_user_indexes`, `pg_column_size` over `events` and `mechanisms`, `pg_database_size('tectonic')`. Read-only.
- `apps/server/src/ingest/backfill.ts`, `apps/server/src/ingest/details.ts`, `apps/server/src/ingest-cli.ts`, `apps/server/src/usgs/client.ts`, `apps/server/src/usgs/parse.ts`, `apps/server/src/repositories/events.ts`, `apps/server/src/db/schema.ts`.
