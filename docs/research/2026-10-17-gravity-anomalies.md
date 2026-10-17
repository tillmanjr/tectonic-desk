# Gravity anomaly layer for Tectonic Desk: feasibility report

Research report, 2026-10-17. Prepared by a research agent for discussion; not a spec.
Every URL in the Sources list was fetched on 2026-10-16 unless marked otherwise. ICGEM has
moved from `icgem.gfz-potsdam.de` to `icgem.gfz.de` (302). BGI's WGM2012 product page URLs
quoted by third parties all 404 now; the live entry point is the grids index, whose "Download
global grids" link goes to DOI 10.18168/bgi.23, which lands on a JS-rendered catalogue page
that could not be read. Treat WGM2012 file names and sizes as unverified.

## 1. Data

| Product                                                        | What it is                                                                                                                                                                                                          | Resolution                                                      | Format / size                                                                                                         | Licence                                                                                 | Verified                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Scripps marine gravity v34.1 (Sandwell, Smith et al.)          | Free-air anomaly from altimetry; `grav`, `grav_error`, `curv` (VGG), `east`/`north` deflections                                                                                                                     | 1 arc-min, ±80° (NaN beyond)                                    | `.img` Mercator 712 MB; `.nc` lon-lat 599 MB; 24 GeoTIFF tiles of ~230 MB (2017 vintage); README_V34 dated 2026-09-18 | No terms stated anywhere on the server; cite Sandwell et al. 2019                       | Directory listing, README, GeoTIFF dir                                                                                                   |
| GMT remote `@earth_faa` (same Scripps data, EGM2008 over land) | Free-air anomaly, mGal, short-int netCDF                                                                                                                                                                            | 01d to 01m; 06m = 3600x1800 = 7.4 MB; 10m = 2.8 MB; 02m = 59 MB | netCDF; `gmt grdconvert` or PyGMT `load_earth_free_air_anomaly` gives GeoTIFF                                         | No licence stated; two citations required                                               | Dataset page                                                                                                                             |
| GMT `@earth_vgg`                                               | Vertical gravity gradient, Eötvös (sharper lineaments, no units a non-specialist expects)                                                                                                                           | same ladder, 01m = 235 MB                                       | netCDF                                                                                                                | as above                                                                                | Dataset page                                                                                                                             |
| GMT `@earth_geoid`                                             | EGM2008 geoid height, metres. Not an anomaly                                                                                                                                                                        | 01m = 100 MB; 06m = 5.9 MB                                      | netCDF                                                                                                                | as above                                                                                | Dataset page                                                                                                                             |
| EGM2008 (NGA)                                                  | Spherical-harmonic model to degree 2190 (~9 km half-wavelength); 2.5' geoid grid 128 MB zip; "Gravity Anomalies & DoV" release (2009) is listed but has no download link on today's page                            | 5' native area-mean anomalies                                   | big-endian binary, Fortran readers                                                                                    | US government, no terms stated                                                          | earth-info page                                                                                                                          |
| EGM96                                                          | Legacy, degree 360 (~55 km). NGA says use EGM2008                                                                                                                                                                   | 15' geoid grid                                                  | binary                                                                                                                | public                                                                                  | earth-info page                                                                                                                          |
| ICGEM (GFZ)                                                    | Model archive plus "Calculation Service" that computes gravity anomaly / Bouguer / geoid grids for any model (EGM2008, XGM2019e_2159 degree 2190 with GOCO06s satellite core, GOCO06s degree 300 ~67 km, SGG-UGM-2) | user grid step, no stated limit                                 | ASCII `.gdf`                                                                                                          | No licence; cite Ince et al. 2019 and the model DOI                                     | Model table verified; the grid service showed "Due to high load, no new calculations are accepted" today. Do not build a pipeline on it. |
| WGM2012 (BGI)                                                  | Complete spherical Bouguer, Airy-Heiskanen isostatic (Tc 30 km), surface free-air; built from EGM2008 + DTU10 with ETOPO1 terrain corrections                                                                       | 2 arc-min global                                                | formats/sizes unverified (GMT grd historically)                                                                       | "distributed free of charge", academic use, attribution + DOI, no resale, no navigation | Grids index and terms page verified; download page not reachable                                                                         |
| USGS conterminous US (Kucks 1999, from DDS-9)                  | Complete Bouguer (2.67 g/cc) and isostatic residual (Airy, 30 km root, 0.35 g/cc contrast); offshore values are free-air                                                                                            | 4 km Albers NAD27; 776x1321 cells                               | GeoTIFF geographic NAD83: isostatic 3.0 MB, Bouguer 11.4 MB; also e00, GXF, XYZ, WMS                                  | US public domain, no constraints                                                        | mrdata page, FAQ metadata, WMS capabilities                                                                                              |
| USGS DS-234 Nevada                                             | Complete Bouguer, 1 km, minimum-curvature, UTEP/PACES stations                                                                                                                                                      | 1 km                                                            | `grvcba.grd`                                                                                                          | public                                                                                  | Page verified; PACES itself is defunct per WA DNR (2023)                                                                                 |
| GGMplus 2013 (Curtin)                                          | Gravity disturbance / free-air, land within ±60° plus 10 km coastal strip                                                                                                                                           | 7.2 arc-sec                                                     | 881 big-endian 5°x5° tiles, 74 GB per functional                                                                      | free, no named licence, no warranty                                                     | readme verified                                                                                                                          |
| Geoscience Australia 2019 grids (analogy)                      | FAA, complete Bouguer, de-trended isostatic residual                                                                                                                                                                | 400 m, netCDF in gu (µm/s²)                                     | NCI netCDF                                                                                                            | CC BY 4.0 (portal default)                                                              | search only                                                                                                                              |

## 2. Representation

What a geologist expects depends on the view. Free-air tracks topography/bathymetry at short
wavelengths and is the standard marine product: trenches are -150 to -300 mGal lows, the outer
rise a +30 to +60 bulge, seamounts +100 to +300, ridges small because they are compensated;
Hawaiian-style flexural moats read as paired low/high. Complete Bouguer removes topographic
mass and therefore shows crustal thickness: Tibet and the Andes reach -500 to -600, Basin and
Range -150 to -250 with the Great Basin low, the Sierra Nevada root a -200 low. Globally
Bouguer is dominated by the continent-ocean step (ocean basins +300 to +500) and looks like a
bathymetry map; it is the wrong default for a global view. Isostatic residual subtracts a
compensation model and is the continental-interior product: residuals of ±30 to ±80 mGal pick
out sedimentary basins (lows), mafic bodies and the Great Valley ophiolitic basement (highs),
the Snake River Plain and Yellowstone low, and the Basin and Range horst-graben grain. The USGS
CONUS isostatic grid is exactly what a US-trained geologist has seen in print.

Colour conventions: USGS and GA maps use a rainbow with blue negative, red positive, often
nonlinear. A modern reader accepts a perceptual diverging ramp centred on zero for free-air and
isostatic residual; Bouguer over a continental window is one-signed and wants a sequential
ramp, not a diverging one with a fake zero. Hillshading the field (sun-shaded gravity) is
normal in exploration geophysics and emphasises lineaments, which is attractive under a fault
layer, but it also exposes interpolation texture and altimetry track noise at high zoom.

Pitfalls, in rough order of embarrassment:

- Geoid height (metres, long wavelength, Indian Ocean low) is not an anomaly and reflects
  mantle structure, not crustal geology. Never offer it beside anomalies.
- Mixed Bouguer conventions: the USGS grid switches to free-air offshore, WGM2012 uses a
  complete spherical Bouguer with water replaced by rock everywhere. Combining them produces a
  coastline discontinuity. State reduction density (2.67) and the compensation model in the
  legend.
- Resolution: 2 arc-min or 4 km cells are ~5 px at the base scale and a 200 px blur at 40x
  zoom. Rendered smooth it is honest; rendered as blocks it suggests precision that is not
  there; contoured it becomes spaghetti.
- EGM2008 fill: interior South America, Africa, Antarctica and parts of Asia are
  topography-implied fills at roughly degree-360 content. The field looks uniform but is not.
  Western US and the oceans are genuinely resolved.
- Colour lies: an unclipped ramp spanning -600 to +500 flattens the ±50 mGal continental
  signal; a ramp clipped at ±100 makes every trench and seamount look identical.
- Causation: a density anomaly layer under epicentres invites "quakes happen where gravity is
  low". The honest story is that both reflect the same structure (trench, basin edge, range
  front), and that only in some places.

## 3. Technical options

Single pre-projected PNG per view, under the vector layers in the SVG `<image>`, with the same
zoom transform. Resolution is capped by the data, so a global image 2048 px wide carries the
full content of a 10' grid and most of a 6' grid; the West Coast conic at 2048 px is already 5x
oversampled relative to the 4 km USGS grid. Estimated sizes (not measured): global 2048x1024
8-bit palette PNG 1 to 2 MB, 4096x2048 about 4 to 6 MB; West Coast 2048 px about 1 to 2 MB;
hillshade roughly doubles both. Raster tiles are unnecessary at these sizes and would
complicate the static-asset model.

Projection handling: do not use gdalwarp to match d3. Rasterise in Node with the same d3-geo
projections the app uses (`geoNaturalEarth1`, the conic), inverting each output pixel to
lon/lat and sampling the grid bilinearly. Output pixels then align exactly with the
plate-boundary and fault paths.

Contours as TopoJSON: a global free-air field at 20 mGal interval from a 2' grid is dominated
by seamounts and will run to tens of MB and look like noise. A low-passed (0.5°) field at
25 mGal is feasible (perhaps 2 to 4 MB quantized) but adds little under markers. For the West
Coast, isostatic residual at 10 mGal from the 4 km grid is plausible at 1 to 3 MB, but it
competes visually with Quaternary faults.

Canvas/WebGL raster from a 16-bit grey data PNG allows theme-aware ramps and legend hover, but
is a new rendering path for a single layer. Not worth it in v1.

Legibility: opacity 0.5 to 0.65, `mix-blend-mode: multiply` on the light theme and plain alpha
on dark; a reduced-chroma ramp so magnitude/depth marker colours stay distinct; faults drawn
above at full opacity. Legend: horizontal ramp with fixed breaks, units mGal, a one-line
caption naming product, grid spacing, reduction density or compensation model, and vintage.

## 4. Recommendation

Do it, as a default-off "Gravity" layer with one variant per view rather than a free choice of
three:

- Global view: free-air from Scripps v34 via `@earth_faa_06m` (EGM2008 over land, 7.4 MB
  netCDF). Diverging ramp -120 to +120 mGal with soft clipping and a note that trenches exceed
  the scale. Optionally a WGM2012 isostatic variant later if the download can be obtained.
- West Coast view: USGS isostatic residual (`USgrv_iso_SDD_geog.tif`, 3 MB, public domain),
  ramp -80 to +80 mGal, optional Bouguer toggle with a sequential ramp -300 to +50. Gentle
  hillshade is defensible here because the lineaments are real range fronts.

Pipeline: `pygmt`/`gmt grdconvert` to GeoTIFF for the global grid; `gdalwarp -t_srs EPSG:4326`
and `gdal_translate` to float GeoTIFF for USGS; a Node script (d3-geo + sharp or pngjs) renders
two PNGs per view per theme and emits `gravity-legend.json` with ramp stops and caption text;
check the PNGs in like the geo files and never hand-edit.

Avoid: geoid; global Bouguer in the global view; rainbow ramps; global contours; any numeric
"anomaly at this epicentre" readout or correlation text; hillshade on the global image; the
ICGEM live service as a dependency.

## Sources

- https://topex.ucsd.edu/marine_grav/mar_grav.html
- https://topex.ucsd.edu/pub/global_grav_1min/
- https://topex.ucsd.edu/pub/global_grav_1min/README_V34.txt
- https://topex.ucsd.edu/pub/global_grav_1min/geotiff/
- https://www.generic-mapping-tools.org/remote-datasets/earth-faa.html
- https://www.generic-mapping-tools.org/remote-datasets/earth-vgg.html
- https://www.generic-mapping-tools.org/remote-datasets/earth-geoid.html
- https://www.generic-mapping-tools.org/remote-datasets/
- https://earth-info.nga.mil/index.php?dir=wgs84&action=wgs84
- https://icgem.gfz.de/home
- https://icgem.gfz.de/tom_longtime
- https://icgem.gfz.de/calcgrid
- https://bgi.obs-mip.fr/grids-and-models-2/
- https://bgi.obs-mip.fr/data-products/terms-of-use/
- https://doi.org/10.18168/bgi.23 (redirects to a JS catalogue page; content not readable)
- https://mrdata.usgs.gov/gravity/
- https://mrdata.usgs.gov/metadata/usgravboug.faq.html
- https://mrdata.usgs.gov/metadata/usgraviso.faq.html
- https://mrdata.usgs.gov/services/gravity?request=GetCapabilities&service=WMS&version=1.3.0
- https://pubs.usgs.gov/ds/2006/234/nv_boug.htm
- https://ddfe.curtin.edu.au/gravitymodels/GGMplus/GGMplus_readme.dat
- https://data.gov.au/data/dataset/a53b4f53-e76a-42fe-96d0-caa980c4b133 (search result, not fetched)
- https://www.earthbyte.org/interactive-virtual-gravity-globe-based-on-bgis-global-gravity-grids-by-bonvalot-et-al-2012/
- https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Geophysics/MapServer/8 (search result on PACES status, not fetched)
