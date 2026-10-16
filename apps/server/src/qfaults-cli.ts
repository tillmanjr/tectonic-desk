/**
 * Regenerates `data/geo/wc-qfaults.json` from the USGS Quaternary Fault and
 * Fold Database (ArcGIS layer 21, "National Database"), clipped to the West
 * Coast preset's bbox.
 *
 * Usage: `pnpm --filter @tectonic/server geo:qfaults [minWeight] [cacheFile]`
 * `minWeight` is the simplification threshold in square degrees (see
 * `faultTopology`); `cacheFile`, when given, stores the raw pieces so the
 * threshold can be tuned without fetching the 110,000 pieces again.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_GEO_DIR } from "./geo/assets.js";
import { DEFAULT_MIN_WEIGHT, faultTopology, mergeTraces, type QfaultPiece } from "./geo/qfaults.js";
import { REGIONS } from "./regions.js";

const LAYER = "https://earthquake.usgs.gov/arcgis/rest/services/haz/Qfaults/MapServer/21/query";
const FIELDS = [
  "fault_name",
  "section_name",
  "fault_id",
  "section_id",
  "age",
  "slip_rate",
  "slip_sense",
  "dip_direction",
  "symbology",
].join(",");
const PAGE = 2000;

interface Page {
  features: QfaultPiece[];
  exceededTransferLimit?: boolean;
}

async function fetchPieces(bbox: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): Promise<QfaultPiece[]> {
  const out: QfaultPiece[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: FIELDS,
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: "geojson",
    });
    const res = await fetch(`${LAYER}?${params.toString()}`);
    if (!res.ok)
      throw new Error(`USGS Qfaults answered ${String(res.status)} at offset ${String(offset)}`);
    const page = (await res.json()) as Page;
    out.push(...page.features);
    process.stderr.write(`\r${String(out.length)} pieces`);
    if (page.exceededTransferLimit !== true) break;
  }
  process.stderr.write("\n");
  return out;
}

async function main(): Promise<void> {
  const wc = REGIONS.find((r) => r.id === "wc");
  if (wc === undefined || wc.bbox === null) throw new Error("West Coast preset has no bbox");
  const minWeight = process.argv[2] === undefined ? DEFAULT_MIN_WEIGHT : Number(process.argv[2]);
  const cache = process.argv[3];
  let pieces: QfaultPiece[];
  if (cache !== undefined && existsSync(cache)) {
    pieces = (JSON.parse(readFileSync(cache, "utf8")) as Page).features;
  } else {
    pieces = await fetchPieces(wc.bbox);
    if (cache !== undefined) writeFileSync(cache, JSON.stringify({ features: pieces }));
  }
  const merged = mergeTraces(pieces);
  const topo = faultTopology(merged, { minWeight });
  const body = JSON.stringify(topo);
  const file = join(DEFAULT_GEO_DIR, "wc-qfaults.json");
  writeFileSync(file, `${body}\n`);
  const lines = merged.reduce((n, f) => n + f.geometry.coordinates.length, 0);
  const vertices = topo.arcs.reduce((n, a) => n + a.length, 0);
  console.log(
    `${String(pieces.length)} pieces -> ${String(merged.length)} features, ${String(lines)} lines, ${String(vertices)} vertices, ${String(Math.round(body.length / 1024))} KB -> ${file}`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
