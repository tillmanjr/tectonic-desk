# Space weather for Tectonic Desk: sources, consistency, representation, first scope

Research report, 2026-10-17. Prepared by a research agent for discussion; not a spec. All
URLs below were fetched 2026-10-17 around 01:05 UTC unless marked otherwise. Verified
structures come from the live JSON, not documentation.

## 1. Sources and services

**NOAA SWPC, services.swpc.noaa.gov.** Static files behind CloudFront, Apache;
`Cache-Control: max-age=60`, `ETag`, `Last-Modified`, `Access-Control-Allow-Origin: *`. No API
key, no documented rate limit; the NWS disclaimer applies: public domain, poll in step with
refresh schedules, retry no faster than ~1/min, NOAA may block abusive IPs. Two important 2026
changes:

- **swpc.noaa.gov now 301-redirects to spaceweather.gov** (all product pages). The data host
  is unchanged.
- **`products/solar-wind/*.json` (mag-1-day, plasma-1-day, mag-7-day) returns 404**, also on
  the woc mirror. SWPC stopped DSCOVR ingest on 2026-06-30; SOLAR-1 (ex SWFO-L1) is primary,
  ACE backup, IMAP I-ALiRT being phased in. The replacement is `json/rtsw/` (24 h only). Any
  tutorial-era code using the old paths is dead.
- **A March 2026 format notice (scn26-21)** converted several products from header-row arrays
  to arrays of objects; the files below reflect the new form.

Verified SWPC files (cadence = observed spacing; all times UTC, mostly without a `Z`):

| Product                    | URL (services.swpc.noaa.gov/...)                                                                                                                                                                 | Shape and notes                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kp 3-h observed            | `products/noaa-planetary-k-index.json`                                                                                                                                                           | 56 objects `{time_tag, Kp (2.33), a_running, station_count: 8}`, 7 days                                                                                                                                                                                                                                  |
| Kp 1-min estimated         | `json/planetary_k_index_1m.json`                                                                                                                                                                 | ~360 objects `{time_tag, kp_index, estimated_kp, kp:"3M"}`, last 6 h only                                                                                                                                                                                                                                |
| Kp observed+3-day forecast | `products/noaa-planetary-k-index-forecast.json`                                                                                                                                                  | 81 objects `{time_tag, kp, observed: observed/estimated/predicted, noaa_scale}` 3-hourly to D+3                                                                                                                                                                                                          |
| Boulder K 1-min            | `json/boulder_k_index_1m.json`                                                                                                                                                                   | 24 h                                                                                                                                                                                                                                                                                                     |
| NOAA scales                | `products/noaa-scales.json`                                                                                                                                                                      | keys `-1,0,1,2,3`: yesterday, now, D+1..D+3; `R{Scale,Text,MinorProb,MajorProb} S{Scale,Text,Prob} G{Scale,Text}`; forecast days carry probabilities for R/S and a G scale                                                                                                                               |
| 3-day / 27-day text        | `text/3-day-forecast.txt`, `text/27-day-outlook.txt`                                                                                                                                             | 27-day: daily F10.7, Ap, max Kp, issued Mondays                                                                                                                                                                                                                                                          |
| Solar wind mag             | `json/rtsw/rtsw_mag_1m.json`                                                                                                                                                                     | 1.4 MB, 24 h, one row per spacecraft per minute (`source`: SOLAR1/ACE/IMAP; `active: true` marks the forecaster-selected primary); `bt, bx/by/bz_gse, bx/by/bz_gsm, theta/phi`                                                                                                                           |
| Solar wind plasma          | `json/rtsw/rtsw_wind_1m.json`                                                                                                                                                                    | 2.4 MB; `proton_speed, proton_density, proton_temperature`, GSE/GSM velocity components, alpha fields often null                                                                                                                                                                                         |
| Ephemerides                | `json/rtsw/rtsw_ephemerides_1h.json`                                                                                                                                                             | 30 days, per spacecraft                                                                                                                                                                                                                                                                                  |
| Propagated wind            | `products/geospace/propagated-solar-wind-1-hour.json`                                                                                                                                            | header-row arrays; gives `propagated_time_tag` (L1 to Earth, ~50 min that day)                                                                                                                                                                                                                           |
| Dst                        | `products/kyoto-dst.json`                                                                                                                                                                        | hourly, 7 days                                                                                                                                                                                                                                                                                           |
| Geospace model Kp          | `json/geospace/geospace_pred_est_kp_1_hour.json`                                                                                                                                                 | model nowcast/forecast, 1-min                                                                                                                                                                                                                                                                            |
| GOES X-ray 1-min           | `json/goes/primary/xrays-{6-hour,1-day,3-day,7-day}.json`                                                                                                                                        | 2 rows/min (`energy` 0.05-0.4nm, 0.1-0.8nm), `flux, observed_flux, electron_correction`; 7-day = 4.4 MB                                                                                                                                                                                                  |
| Flares                     | `json/goes/primary/xray-flares-latest.json`, `xray-flares-7-day.json`                                                                                                                            | `begin/max/end_time, *_class, max_xrlong, satellite`                                                                                                                                                                                                                                                     |
| X-ray background           | `json/goes/primary/xray-background-7-day.json`                                                                                                                                                   | daily                                                                                                                                                                                                                                                                                                    |
| Protons                    | `json/goes/primary/integral-protons-{6-hour..7-day}.json` (5-min, 8 channels >=1..>=500 MeV), `integral-proton-fluence-7-day.json` (daily)                                                       |                                                                                                                                                                                                                                                                                                          |
| GOES source map            | `json/goes/instrument-sources.json`                                                                                                                                                              | that day: xrays and protons primary GOES-18, magnetometers/SUVI primary GOES-19                                                                                                                                                                                                                          |
| F10.7                      | `json/f107_cm_flux.json` (Penticton 17/20/22 UT readings, 90-day mean, 40 days), `products/10cm-flux-30-day.json` (daily)                                                                        |                                                                                                                                                                                                                                                                                                          |
| Sunspots                   | `json/sunspot_report.json` (per-region observatory reports, 30 days), `json/solar-cycle/observed-solar-cycle-indices.json` (monthly SSN + F10.7 from 1749, 512 KB), `predicted-solar-cycle.json` |                                                                                                                                                                                                                                                                                                          |
| Alerts                     | `products/alerts.json`                                                                                                                                                                           | ~80 most recent `{product_id (K04A, K05W, A20F, XM5S, EF3A...), issue_datetime, message}`; message is the full NWS text with CRLF; older ones at ftp.swpc.noaa.gov/pub/alerts/                                                                                                                           |
| OVATION grid               | `json/ovation_aurora_latest.json`                                                                                                                                                                | 900 KB; `Observation Time`, `Forecast Time` (~60 min ahead), `coordinates`: **65,160 triples `[lon 0..359, lat -90..90, value 0..100]`, 1 degree, 360x181** (not 1024x512). Cadence 5 min per `aurora-nowcast-hemi-power.txt`; value is percent probability of visible aurora. That day max 13 at Kp ~2. |
| OVATION frames             | `products/animations/ovation_{north,south}_24h.json`                                                                                                                                             | 288 frame URLs (5-min) for a 24-h loop; `text/ovation_latest_aurora_{n,s}.txt` is the raw MLT/maglat energy-flux table with `Forecast Kp`                                                                                                                                                                |
| Hemispheric power          | `text/aurora-nowcast-hemi-power.txt`                                                                                                                                                             | GW north/south, 5-min                                                                                                                                                                                                                                                                                    |
| Imagery                    | `images/animations/suvi/primary/{094,131,171,195,284,304}/latest.png` (GOES SUVI, public domain), `images/aurora-forecast-{northern,southern}-hemisphere.jpg`                                    |                                                                                                                                                                                                                                                                                                          |

Retention: SWPC keeps 6 h to 7 days (30 days for a few); nothing longer. Anything historical
must be stored locally or pulled from NCEI.

**GFZ Kp (authoritative).** `https://kp.gfz.de/app/json/?start=...&end=...&index=Kp[&status=def]`
returns `{meta, datetime[], Kp[], status[]}` (`def`/`pre`), CC BY 4.0, data since 1932; also
`ap, Ap, Cp, C9, Hp30, Hp60` (Hp30/60 nowcast only). Nowcast appears within minutes after each
3-h window; definitive monthly. Cite Matzka et al. 2021, DOI 10.5880/Kp.0001. Verified:
2026-10-14..16 returned 24 values (e.g. 4.0 at 16/18 UT).

**NASA DONKI.**
`https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/{CME,CMEAnalysis,FLR,GST,SEP,IPS,MPC,RBE,HSS,notifications}?startDate=&endDate=`
(no key) and the same via `https://api.nasa.gov/DONKI/...?api_key=` (DEMO_KEY 30/h, 50/day
per IP; registered key 1000/h). **Both were unreachable that day** (kauai: connection
refused; api.nasa.gov: 503 upstream). Human-curated, hours to a day latency, excellent for CME
arrival estimates and event linkage, poor for uptime. Treat as enrichment, never as the
critical path.

**Others.** INTERMAGNET: 1-min variation data via IAGA-2002/ImagCDF, CC BY-NC 4.0 with
commercial carve-out; useful only for a station magnetogram. ESA SWE portal: snapshot only,
registration, "under review/construction", no API. Met Office: text forecast and SDO images,
no public JSON. BOM ASWFC: web reports; its API needs a key. SDO:
`https://sdo.gsfc.nasa.gov/assets/img/latest/latest_{512,1024,2048,4096}_{0193,0304,0171,0211,0131,0335,0094,1600,1700,HMIB,HMIBC,HMIIC,HMII,HMID}.jpg`,
`Cache-Control: no-cache`, refreshed roughly every 15 min, no copyright, credit "Courtesy of
NASA/SDO and the AIA, EVE, and HMI science teams". SOHO LASCO:
`https://soho.nascom.nasa.gov/data/realtime/{c2,c3,eit_171,eit_195,eit_284,eit_304}/512/latest.jpg`.
SpaceWeatherLive: copyrighted commercial site; use only to eyeball numbers.

## 2. Data consistency

- **Three Kp flavours.** SWPC's 1-min `estimated_kp` is a running estimate from 8 stations
  (Sitka, Meanook, Ottawa, Fredericksburg, Hartland, Wingst, Niemegk, Canberra) and revises
  until the 3-h window closes; the 3-h `products/noaa-planetary-k-index.json` is SWPC's final
  estimate; GFZ Kp uses 13 observatories, nowcast within minutes, definitive monthly.
  Differences of one third are routine, a full step during storms. Label the source; backfill
  the GFZ definitive value when it lands and show both in drill-down.
- **Scales.** G1..G5 = Kp 5,6,7,8,9 (G4 includes 9-). S1..S5 = >=10 MeV proton flux 10, 10^2,
  10^3, 10^4, 10^5 pfu. R1..R5 = GOES 0.1-0.8 nm flux M1 (1e-5), M5 (5e-5), X1 (1e-4), X10
  (1e-3), X20 (2e-3) W/m^2. R and S are instantaneous; G is per 3-h window;
  `noaa-scales.json` forecast days carry R/S as probabilities but G as a predicted level. Do
  not render probabilities and levels in the same cell style.
- **Aurora.** OVATION outputs energy flux by MLT and magnetic latitude; SWPC converts it to a
  per-cell percent probability of visible aurora, assuming a linear relation to intensity. It
  is a 30-90 min forecast, not an image; when L1 data are bad it falls back to Kp with no lead
  time (the text file's `Forecast Kp` line reveals this). Daylight, cloud and light pollution
  are ignored; aurora is visible ~1000 km equatorward of the oval. SWPC removed its Kp "view
  line" in May 2026, so there is no official line to copy.
- **Solar wind sources.** `active` flags the forecaster's primary per data type; mag and
  plasma may come from different spacecraft in the same minute. ACE SWEPAM degrades during
  proton events; IMAP coverage is not yet 24/7. Expect nulls, duplicate minutes across sources,
  and silent source switches: key rows on `(time_tag, source)`.
- **Timestamps** are UTC; most SWPC files omit `Z`, GOES files include it, DONKI uses
  `yyyy-MM-ddTHH:mmZ`. Normalise on ingest.

## 3. Representation

Summary strip (six tiles, 6-h sparklines): Kp (1-min estimated, 3-h bar behind it), R/S/G now
with D+1 probability, Bz GSM with Bt, speed and density, 0.1-0.8 nm X-ray on a log axis with
class ticks, F10.7 with SSN. A geologist will value Dst, the Bz sign, hemispheric power and
the Kp-vs-definitive trail more than flare counts; skip electron fluence and radio-burst noise
in the first cut.

Forecast table: `noaa-scales.json` rows for D+1..D+3 with Kp maxima from the forecast JSON
and the 27-day outlook as a context strip.

Aurora overlay: the 360x181 grid is geographic lon/lat, so convert to a 1-degree GeoJSON
polygon mesh (or a 360x181 canvas warped via `geoPath` on a raster) and draw cells >= 10
percent semi-transparent under the terminator; threshold contours (10/30/50/70) with
d3-contour reproject cleanly to Natural Earth. Shift lon 180..359 to -180..-1 before
projecting. Keep the last 12 to 24 frames (5-min) in memory for a scrub; always print both
Observation and Forecast times and the fallback-to-Kp state. Never label it "aurora visible
here".

Radiation timeline: >=10 and >=100 MeV proton flux with S thresholds, flare begin/max/end
bands from `xray-flares-7-day.json`, alert markers from `alerts.json`. Latest SDO: 512 px AIA
193 and HMI intensitygram, credit line; the filename carries no timestamp, so show fetch time.

## 4. First scope

Poll from the existing ingest loop with per-feed cadences: `planetary_k_index_1m`,
`noaa-scales`, `rtsw_mag_1m`, `rtsw_wind_1m` every 5 min (store only `active` rows plus the
source name; ~1,440 rows/day each); `xrays-6-hour`, `integral-protons-6-hour`,
`xray-flares-7-day`, `alerts.json` every 5 min, upsert by time_tag; `ovation_aurora_latest`
every 5 min, store as one row per frame with the grid gzipped `bytea` (~40 KB compressed,
~12 MB/day) and keep 48 h; `noaa-planetary-k-index`, `kyoto-dst`, `f107_cm_flux`,
`noaa-planetary-k-index-forecast` hourly; GFZ Kp daily with a 7-day backfill window and a
`status` column; `observed-solar-cycle-indices` weekly. Fetch live through the API (short
cache): SDO/SUVI images and the 27-day outlook. Retention: 1-min series 30 days then 5-min
roll-up for a year; 3-h Kp, Dst, flares, alerts, F10.7, SSN forever (tiny). Total well under
1 GB/year. Defer: DONKI (unstable), INTERMAGNET, electron fluence, Enlil/WSA, the Geospace
model Kp, SOHO coronagraphs, and any per-location visibility claim.

## Sources

- https://services.swpc.noaa.gov/products/ and https://services.swpc.noaa.gov/json/ (directory listings)
- https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
- https://services.swpc.noaa.gov/json/planetary_k_index_1m.json
- https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
- https://services.swpc.noaa.gov/products/noaa-scales.json
- https://services.swpc.noaa.gov/text/3-day-forecast.txt and https://services.swpc.noaa.gov/text/27-day-outlook.txt
- https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json, rtsw_wind_1m.json, rtsw_ephemerides_1h.json
- https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json
- https://services.swpc.noaa.gov/products/kyoto-dst.json
- https://services.swpc.noaa.gov/json/goes/primary/ (xrays, flares, protons, background, fluence) and https://services.swpc.noaa.gov/json/goes/instrument-sources.json
- https://services.swpc.noaa.gov/json/f107_cm_flux.json, products/10cm-flux-30-day.json, json/sunspot_report.json, json/solar-cycle/observed-solar-cycle-indices.json
- https://services.swpc.noaa.gov/products/alerts.json
- https://services.swpc.noaa.gov/json/ovation_aurora_latest.json, products/animations/ovation_north_24h.json, text/aurora-nowcast-hemi-power.txt, text/ovation_latest_aurora_n.txt
- https://www.spaceweather.gov/products/aurora-30-minute-forecast
- https://www.spaceweather.gov/products/aurora-viewline-tonight-and-tomorrow-night-experimental (view line removed May 2026)
- https://www.spaceweather.gov/products/planetary-k-index
- https://www.spaceweather.gov/products/solar-wind and https://swpc-drupal.woc.noaa.gov/news/solar-wind-data-and-display-changes (DSCOVR end 2026-06-30)
- https://www.spaceweather.gov/noaa-scales-explanation
- https://www.spaceweather.gov/products/goes-x-ray-flux
- https://www.weather.gov/media/notification/pdf_2026/scn26-21_Data_Format_Changes_Impacting_SWPC_Products.pdf
- https://www.weather.gov/disclaimer (public domain and polling etiquette)
- https://kp.gfz.de/en/data and https://kp.gfz.de/app/format/json.txt; https://kp.gfz.de/app/json/?start=2026-10-14T00:00:00Z&end=2026-10-16T23:59:59Z&index=Kp
- https://ccmc.gsfc.nasa.gov/tools/DONKI/ ; https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/CME ; https://api.nasa.gov/assets/html/authentication.html
- https://sdo.gsfc.nasa.gov/data/ and https://sdo.gsfc.nasa.gov/data/rules.php
- https://soho.nascom.nasa.gov/data/realtime-images.html
- https://intermagnet.org/data_conditions.html
- https://swe.ssa.esa.int/ ; https://weather.metoffice.gov.uk/specialist-forecasts/space-weather ; https://www.sws.bom.gov.au/Space_Weather/1/1
- https://cartopy.readthedocs.io/stable/gallery/scalar_data/aurora_forecast.html (OVATION grid parsing example)
