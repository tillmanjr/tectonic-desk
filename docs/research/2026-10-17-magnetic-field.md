# Earth's magnetic field as a Tectonic Desk layer

Research report, 2026-10-17. Prepared by a research agent for discussion; not a spec.
Every URL marked [fetched] was retrieved on 2026-10-16 and the facts come from the
response; [search] means seen only in search snippets.

## 1. Data and services

### (a) Main (core) field: WMM2025 and IGRF-14

- **WMM2025** (NOAA NCEI + BGS). Released 2024-12-17, epoch 2025.0, valid to 2030.0
  [fetched: NCEI WMM page]. Public domain ("not licensed or under copyright"), with a 17 USC
  403 notice requirement if you copyright a derivative. Downloads: `WMM.COF` coefficients (via
  a voluntary survey redirect), technical report PDF, test values, and **pre-made
  maps/shapefiles** at `https://data.ngdc.noaa.gov/geomag/wmm/wmm2025/shapefiles/` [fetched]:
  per-year folders 2025–2030; the 2025 folder holds `WMM_2025_DI_shape_geographic.zip`
  (81 MB), `..._HXYZF_...` (88 MB), `..._all_shape_geographic.zip` (231 MB), north/south stereo
  variants; at the root, `WMM2025-2030_BoZ_Shapefile.zip` (5.7 MB, blackout zones),
  `WMM2025-2030_D_15min_Shapefile.zip` (1.3 GB), and geomagnetic-coordinate shapefiles
  (115 MB). These are heavy because they are full-resolution contour sets; they are source
  material, not something to ship.
- **Accuracy/limits** [fetched: NCEI accuracy page]: 1-sigma uncertainties F 138 nT, H 133 nT,
  I 0.20°, D = sqrt(0.26² + (5417/H)²)°. Blackout zones = H < 2000 nT (declination
  meaningless), caution zones 2000 ≤ H < 6000 nT. Coefficients degrade over the 5-year epoch;
  a static layer must carry its evaluation date.
- **IGRF-14** (IAGA) [fetched: NCEI IGRF page]: finalised Nov 2024; definitive main field
  1945–2020, provisional 2025.0, SV 2025–2030, degree 13. Coefficients:
  `https://www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt`; public-domain Geomag 7.0,
  pyIGRF14, Fortran, GitHub `IAGA-VMOD`. No grid/contour products.
- **NCEI calculator JSON API** [fetched: docs + two live calls]. GET endpoints with per-service
  keys: `calculateDeclination` (key `zNEw7`), `calculateIgrfwmm` (`EAU2y`),
  `calculateIgrfgrid` (`gFE5W`), models `WMM`, `WMMHR`, `IGRF` (IGRF back to 1590);
  `resultFormat=json`. A live grid call returned
  `{"model":"WMM-2025","version":"1.2.1","result":[{declination, declination_sv,
declination_uncertainty, ...}]}`; San Francisco (37.8, -122.4) on 2026-10-16 gave
  D = 12.83°, SV -0.09°/yr, uncertainty 0.35°. Terms: max 50 connections/s across all users,
  bulk requests serial, back off 5–10 min on errors, keys may change (emailed to registrants).
  Fine for a one-off generation script, not for per-pageview use.
- **State of the field** [search: NCEI State of the Geomagnetic Field 2025]: north dip pole
  drifting toward Siberia at ~35 km/yr (down from 50–60 km/yr); South Atlantic Anomaly deepened
  ~30 nT at the surface and migrated ~20 km west in a year.
- **Real-time activity**: SWPC `noaa-planetary-k-index.json` [fetched] is a 7-day, 3-hourly
  array of `{time_tag, Kp, a_running, station_count}`, latest 2026-10-16T21:00 Kp 2.33.
  INTERMAGNET (now BGS-hosted, HAPI service) is for non-commercial use [fetched: principles
  page]. Neither belongs on a static map; at most a Kp tile in the status bar, which is space
  weather and out of scope for now.

### (b) Crustal anomalies

- **EMAG2v3** (NCEI, Meyer/Chulliat/Saltus 2017, DOI 10.7289/V5H70CVX) [fetched: product page
  - metadata]. 2 arc-min, two grids: **4 km upward-continued** (includes land) and **sea level**
    (ocean only). Float32 GeoTIFFs, 175 MB each:
    `https://www.ngdc.noaa.gov/geomag/data/EMAG2/EMAG2_V3_UpCont_DataTiff.tif` /
    `..._SeaLevel_DataTiff.tif`; plus error GeoTIFF, source-code GeoTIFF, colour-hillshade RGB
    TIFFs (150–294 MB), posters, KMZ. US-government work, not copyrightable in the US; "not for
    navigation". Caveats from metadata: wavelengths > 300 km replaced by the MF7 satellite model;
    sparse ocean tracks kriged and smoothed; the KMZ gap-fills with MF7. An ArcGIS ImageServer
    exists (`gis.ngdc.noaa.gov/arcgis/rest/services/EMAG2v3/ImageServer`, F32, 0.0333° pixels,
    raster function `EMAG2_Color_Scale`, no tile cache, `exportTilesAllowed: false`) [fetched];
    usable for ad-hoc exports, not as a dependency. GMT mirrors downsampled copies [fetched]:
    30' 206 KB, 15' 748 KB, 10' 1.6 MB, 6' 4.1 MB, 2' 33 MB (netCDF, 0.2 nT quantisation).
- **WDMAM 2.2** (CGMW/IAGA, Choi et al. 2025), 3 arc-min, 7200x3600, 29 MB native via GMT
  remote dataset `@earth_wdmam` (downsamples: 15' 1.3 MB, 10' 2.9 MB, 6' 7.7 MB) [fetched: GMT
  page]. The official `wdmam.org` served the fetcher only a page title; licence
  **unverified**. Treat as secondary to EMAG2v3 unless the licence checks out.
- **NAMAG / USGS Magnetic Anomaly Map of North America** (OFR 02-414, DOI 10.3133/ofr02414)
  [fetched: pubs page + mrdata]. 1 km grids, DNAG spherical transverse Mercator (CM 100°W,
  k 0.926), field at **1000 m above terrain**; three variants: `origmrg` (merged), `hp500`
  (500 km high-pass, the published map), `CM` (long wavelengths replaced by CHAMP). Formats:
  Geosoft `.grd`, ArcGIS grids (NA 316 MB, CONUS 46 MB), GXF 11 MB, XYZ 23 MB. Known limits:
  merged surveys unreliable beyond ~150 km wavelength; datum shifts between surveys. USGS also
  exposes a **WMTS** at
  `https://mrdata.usgs.gov/mapcache/wmts/1.0.0/magnetic/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png`
  (WGS84 and GoogleMapsCompatible, 8-bit PNG) and a WMS [fetched capabilities]. Public domain.
- **State compilations** [search]: Oregon DS 355 (49 surveys merged), Nevada DS 234 (500 m,
  305 m draped), Washington DNR geophysics service, NW regional OF 2004-1413 (ID/MT/WA/OR/WY).
  Mixed formats, mostly Geosoft; useful only if a West Coast close-up is wanted.

## 2. Representation for a geologist

- **Main field** wants line work, not fill: declination isogonics (1° or 2°, agonic line
  emphasised), optionally inclination and F contours (thousands of nT), dip poles, and the BoZ
  polygons. Colour by sign (east +, west −) with a dashed agonic line is the chart convention.
  It is smooth (degree 12–13) so it reads fine at 1° sampling and should not be zoomed into:
  at 40x there is nothing to see.
- **Crustal anomalies** want a shaded raster in nT: diverging scale (blue negative, red/magenta
  positive) usually **histogram-equalised**, with NE-illuminated hillshade on the grid (the
  NCEI colour-hillshade TIFFs do exactly this). Linear scales hide the spreading stripes;
  equalised scales exaggerate noise in quiet basins. Label the altitude (4 km or 1000 m above
  terrain) and that EMAG2 land areas are upward-continued and MF7-filled where data are thin.
- **Relation to quakes and faults**: anomalies image magnetisation contrast (basement,
  intrusions, ophiolite, oceanic crust age), not stress. Spreading stripes and fracture zones
  line up with the Gorda/Juan de Fuca ridge seismicity; terrane sutures and the Sierra Nevada
  batholith edge are visible; Quaternary faults mostly are not, because they offset cover, not
  magnetic basement. Pitfalls: mixing core and crustal fields on one legend (nT of F ~ 50,000 vs
  anomalies of ±hundreds); anomaly linears over-read as faults; aliasing at high zoom (EMAG2
  pixels are ~3.7 km, NAMAG 1 km; the conic view at 40x shows pixels); seams between merged
  surveys read as structure; the main field must carry its date and the crustal grid its
  altitude.

## 3. Technical options

- **Client-side core field**: `geomagnetism@0.2.0` (Apache-2.0, 73 KB unpacked, zero deps,
  bundles `wmm-2015/2015v2/2020/2025.json` at 3.6 KB each) is the one npm package already on
  WMM2025 [fetched: jsdelivr file list]; its README is Node-centric and a
  `geomagnetism-no-path` fork exists for browsers, so expect to vendor or wrap it. `geomag`
  (MIT) is still WMM2020 [fetched README]. No npm IGRF-14 package found. WMM evaluation on a
  1°x1° grid is ~65k points, trivial; contours via `d3-contour`. But it adds a runtime library,
  a coverage burden, and no visible benefit over a pre-generated file.
- **Pre-generated contours**: evaluate WMM2025 (own 200-line implementation against NCEI test
  values, or the NCEI grid API serially) on a 1° grid for a chosen date, run d3-contour,
  simplify, write TopoJSON. Estimated 100–300 KB for D at 2° plus F and the BoZ polygons.
  Re-generate per year; file name carries the epoch (`wmm2025_2026.5.topojson`).
- **Crustal raster**: pre-rendered PNG per projection, not tiles. Global Natural Earth view:
  render from the GMT 6' or 10' EMAG2 4-km grid at ~2000x1000 px into the projection,
  equalised colour + hillshade, ~1–2 MB PNG/WebP. Conic West Coast view: cut NAMAG `hp500` (or
  EMAG2 2') to the view bbox at ~3000x3000, ~2–4 MB WebP; at 40x it will pixelate and should
  fade or cap. Draw as an `<image>` under the vector layers at 50–60% opacity in the SVG, or on
  a canvas behind it; keep plate boundaries and faults in high-contrast strokes with a halo.
  Each projection gets its own raster because reprojecting a raster in the browser is slow and
  SVG cannot do it. The USGS WMTS is an alternative for the conic view only if a Web Mercator
  basemap were acceptable, which it is not here.

## 4. Recommendation

Do it, but as **two separate, optional, clearly labelled layers**, never one.

1. **Crustal anomaly raster** (the geologically valuable one): EMAG2v3 4-km for the global
   view, NAMAG hp500 for the West Coast conic. Pipeline: a script fetches the GeoTIFF/GMT grid,
   reprojects with d3-geo or GDAL, histogram-equalises, hillshades, writes WebP per projection
   plus a small JSON legend (nT breakpoints, altitude, source, DOI). Check in the WebP
   (~1–4 MB each). Legend states "total-field anomaly, nT, 4 km above geoid, EMAG2v3 2017" or
   "1000 m above terrain, 500 km high-pass, NAMAG 2002".
2. **Core field contours** (context, lower priority): pre-generated TopoJSON of declination
   isogonics, F contours and BoZ polygons for a dated WMM2025 epoch, regenerated yearly by
   script; legend shows "WMM2025 at 2026.5". Skip inclination unless asked.

Avoid: live calls to the NCEI API from the browser; a single colour legend spanning both
fields; histogram-equalised rasters without a note; WDMAM until its licence is confirmed;
tiles and Mercator; any suggestion that an anomaly linear is a fault; Kp/Dst on the map.

## Sources

- https://www.ncei.noaa.gov/products/world-magnetic-model
- https://www.ncei.noaa.gov/products/world-magnetic-model/accuracy-limitations-error-model
- https://data.ngdc.noaa.gov/geomag/wmm/wmm2025/shapefiles/
- https://data.ngdc.noaa.gov/geomag/wmm/wmm2025/shapefiles/2025/
- https://www.ngdc.noaa.gov/geomag/CalcSurveyFin.shtml
- https://www.ngdc.noaa.gov/geomag-web/calculators/calculateIgrfgrid (live JSON call)
- https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination (live JSON call)
- https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field
- https://www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt
- https://repository.library.noaa.gov/view/noaa/72269 (State of the Geomagnetic Field 2025)
- https://www.ncei.noaa.gov/products/earth-magnetic-model-anomaly-grid-2
- https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ngdc.mgg.geophysical_models:EMAG2_V3/html
- https://gis.ngdc.noaa.gov/arcgis/rest/services/EMAG2v3/ImageServer?f=pjson
- https://www.generic-mapping-tools.org/remote-datasets/earth-mag.html
- https://www.generic-mapping-tools.org/remote-datasets/earth-wdmam.html
- https://wdmam.org/ (content not retrievable)
- https://mrdata.usgs.gov/magnetic/
- https://mrdata.usgs.gov/mapcache/wmts?request=GetCapabilities&service=WMTS&version=1.0.0
- https://pubs.usgs.gov/of/2002/ofr-02-414/
- https://pubs.usgs.gov/ds/355/index.html
- https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
- https://tech-man.intermagnet.org/latest/chapters/intermagnet/principles.html
- https://data.jsdelivr.com/v1/package/npm/geomagnetism@0.2.0
- https://cdn.jsdelivr.net/npm/geomagnetism@0.2.0/README.md
- https://cdn.jsdelivr.net/npm/geomag/README.md
- https://github.com/naturalatlas/geomagnetism
