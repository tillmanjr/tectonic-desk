/**
 * Renders the gravity and magnetic anomaly rasters under `public/fields/` in the two map
 * projections: free-air gravity (Scripps v33 via the GMT mirror) and the EMAG2v3 magnetic
 * anomaly at 4 km for both views, and the USGS DDS-9 isostatic residual for the West Coast.
 * Sources are downloaded once into `.cache/fields/`.
 *
 * Usage: `pnpm --filter @tectonic/web geo:fields`
 */
import type { ApiRegion, FieldRaster, FieldsFile } from "@tectonic/shared";
import * as h5wasm from "h5wasm/node";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { PNG } from "pngjs";
import {
  albersForward,
  DDS9_ALBERS,
  equalisedStops,
  linearStops,
  RAMP,
  renderRaster,
  sampleLonLat,
  sampleProjected,
  type LonLatGrid,
  type ProjectedGrid,
} from "../src/lib/field-render.js";
import { frameFor, type MapFrame } from "../src/lib/geo.js";
import { parseGxf } from "../src/lib/gxf.js";

const CACHE = fileURLToPath(new URL("../.cache/fields/", import.meta.url));
const OUT = fileURLToPath(new URL("../public/fields/", import.meta.url));
/** Output width per view: the global image is the heavier of the two, so it gets fewer pixels. */
const WIDTHS: Record<"global" | "wc", number> = { global: 1536, wc: 2048 };
const GMT = "https://oceania.generic-mapping-tools.org/server/earth";
const SOURCES = {
  faa: { file: "earth_faa_06m_p.grd", url: `${GMT}/earth_faa/earth_faa_06m_p.grd` },
  mag: { file: "earth_mag4km_06m_p.grd", url: `${GMT}/earth_mag4km/earth_mag4km_06m_p.grd` },
  iso: { file: "isograv.gxf.gz", url: "https://mrdata.usgs.gov/gravity/isostatic/isograv.gxf.gz" },
} as const;

/** Copies of the server's two presets; the script has no API to ask. */
const REGIONS: Record<"global" | "wc", ApiRegion> = {
  global: { id: "global", name: "Global", subtitle: "", minMag: 4.5, days: 7, bbox: null },
  wc: {
    id: "wc",
    name: "West Coast US",
    subtitle: "",
    minMag: 2.5,
    days: 30,
    bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
  },
};

async function download(src: { file: string; url: string }): Promise<string> {
  const path = CACHE + src.file;
  if (existsSync(path)) return path;
  console.log(`fetching ${src.url}`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url}: ${String(res.status)}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

const attrNumber = (d: h5wasm.Dataset, name: string, fallback: number): number => {
  const v: unknown = d.attrs[name]?.value;
  if (typeof v === "number") return v;
  if (v instanceof Float64Array || v instanceof Float32Array || v instanceof Int16Array) {
    return v[0] ?? fallback;
  }
  return fallback;
};

/** A GMT netCDF-4 grid: `z[lat][lon]`, int16 with scale and offset, pixel-registered, row 0 south. */
function readGmt(path: string): LonLatGrid {
  const f = new h5wasm.File(path, "r");
  const z = f.get("z");
  if (!(z instanceof h5wasm.Dataset)) throw new Error(`${path}: no z dataset`);
  const [height, width] = z.shape ?? [];
  if (height === undefined || width === undefined) throw new Error(`${path}: z is not 2-D`);
  const raw = z.value;
  if (!(raw instanceof Int16Array)) throw new Error(`${path}: z is not int16`);
  const scale = attrNumber(z, "scale_factor", 1);
  const offset = attrNumber(z, "add_offset", 0);
  const fill = attrNumber(z, "_FillValue", -32768);
  const values = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i] ?? fill;
    values[i] = v === fill ? NaN : v * scale + offset;
  }
  f.close();
  return { width, height, values };
}

/** The USGS isostatic grid with its Albers inverse as `locate`; GXF sense 1 puts row 0 at the south-west. */
function readIso(path: string): ProjectedGrid {
  const g = parseGxf(gunzipSync(readFileSync(path)).toString("latin1"));
  const { points, rows, xOrigin, yOrigin, ptSeparation, rwSeparation } = g;
  return {
    width: points,
    height: rows,
    values: g.values,
    locate(lon, lat) {
      const [x, y] = albersForward(DDS9_ALBERS, lon, lat);
      const col = (x - xOrigin) / ptSeparation;
      const row = (y - yOrigin) / rwSeparation;
      return col < 0 || row < 0 || col > points - 1 || row > rows - 1 ? null : [col, row];
    },
  };
}

/** Output pixel centre to lon/lat through the frame's projection, rejecting points off the sphere. */
function invertFor(frame: MapFrame, width: number, height: number) {
  const sx = frame.width / width;
  const sy = frame.height / height;
  const { projection } = frame;
  return (x: number, y: number): [number, number] | null => {
    const fx = x * sx;
    const fy = y * sy;
    const ll = projection.invert?.([fx, fy]);
    if (ll === undefined || ll === null || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) {
      return null;
    }
    const back = projection(ll);
    if (back === null || Math.hypot(back[0] - fx, back[1] - fy) > 1) return null;
    return ll;
  };
}

function writePng(name: string, width: number, height: number, rgba: Uint8Array): number {
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const bytes = PNG.sync.write(png, { deflateLevel: 9 });
  writeFileSync(OUT + name, bytes);
  return bytes.length;
}

interface Job {
  raster: Omit<FieldRaster, "src" | "width" | "height">;
  sample: (lon: number, lat: number) => number;
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  await h5wasm.ready;
  const faa = readGmt(await download(SOURCES.faa));
  const mag = readGmt(await download(SOURCES.mag));
  const iso = readIso(await download(SOURCES.iso));
  console.log("grids read");
  const magStops = equalisedStops(mag.values, RAMP);
  const magTicks = magStops.map(([v]) => Math.round(v));
  const magnetic = (view: "global" | "wc"): Job => ({
    raster: {
      field: "magnetic",
      view,
      units: "nT",
      stops: magStops,
      ticks: magTicks,
      equalised: true,
      caption:
        "Total-field magnetic anomaly · EMAG2v3 (Meyer, Chulliat and Saltus 2017) via GMT · 6′ grid · 4 km above the geoid",
      source: {
        name: "NCEI EMAG2v3 via GMT earth_mag4km",
        url: "https://www.ncei.noaa.gov/products/earth-magnetic-model-anomaly-grid-2",
        doi: "10.7289/V5H70CVX",
      },
    },
    sample: (lon, lat) => sampleLonLat(mag, lon, lat),
  });
  const jobs: Job[] = [
    {
      raster: {
        field: "gravity",
        view: "global",
        units: "mGal",
        stops: linearStops(120, RAMP),
        ticks: [-120, -60, 0, 60, 120],
        equalised: false,
        caption:
          "Free-air gravity anomaly · Scripps v33 (Sandwell et al. 2019) via GMT · 6′ grid · EGM2008 over land · clipped at ±120",
        source: {
          name: "Scripps marine gravity via GMT earth_faa",
          url: "https://www.generic-mapping-tools.org/remote-datasets/earth-faa.html",
          doi: "10.1016/j.asr.2019.09.011",
        },
      },
      sample: (lon, lat) => sampleLonLat(faa, lon, lat),
    },
    {
      raster: {
        field: "gravity",
        view: "wc",
        units: "mGal",
        stops: linearStops(80, RAMP),
        ticks: [-80, -40, 0, 40, 80],
        equalised: false,
        caption:
          "Isostatic residual gravity anomaly · USGS DDS-9 (Simpson and Jachens) · 4 km grid · Airy-Heiskanen, 2.67 g/cm³ · conterminous US only, free-air offshore · clipped at ±80",
        source: { name: "USGS mrdata gravity", url: "https://mrdata.usgs.gov/gravity/", doi: null },
      },
      sample: (lon, lat) => sampleProjected(iso, lon, lat),
    },
    magnetic("global"),
    magnetic("wc"),
  ];
  const rasters: FieldRaster[] = [];
  for (const job of jobs) {
    const frame = frameFor(REGIONS[job.raster.view]);
    const width = WIDTHS[job.raster.view];
    const height = Math.round((width * frame.height) / frame.width);
    const rgba = renderRaster(
      width,
      height,
      invertFor(frame, width, height),
      job.sample,
      job.raster.stops,
    );
    const name = `${job.raster.field}-${job.raster.view}.png`;
    const bytes = writePng(name, width, height, rgba);
    console.log(`${name} ${String(width)}×${String(height)} ${(bytes / 1e6).toFixed(2)} MB`);
    rasters.push({ ...job.raster, src: `/fields/${name}`, width, height });
  }
  const file: FieldsFile = { generated: new Date().toISOString(), rasters };
  writeFileSync(OUT + "fields.json", JSON.stringify(file, null, 2) + "\n");
  console.log("wrote fields.json");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
