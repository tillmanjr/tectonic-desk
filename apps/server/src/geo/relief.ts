import { distanceKm, slerp, type ApiRelief, type LonLat } from "@tectonic/shared";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The relief grid the section profile samples: SRTM15+ v2.7 (Tozer et al. 2019) as GMT's
 * `earth_relief_03m_p`, eight 90° JPEG 2000 tiles decoded once at image build into a raw grid
 * of metres. Row 0 is the north edge, column 0 is 180°W, pixel-registered.
 */
export interface ReliefLayout {
  width: number;
  height: number;
  /** Degrees per cell. */
  cellDeg: number;
  /** Metres per stored unit in the source tiles. */
  scale: number;
  /** Cells along one side of a tile. */
  tileSize: number;
}

export const RELIEF: ReliefLayout = {
  width: 7200,
  height: 3600,
  cellDeg: 0.05,
  scale: 0.5,
  tileSize: 1800,
};

/** The tiles and the lon/lat of their north-west corner. */
export const RELIEF_TILES: { name: string; lon: number; lat: number }[] = [
  { name: "N00W180", lon: -180, lat: 90 },
  { name: "N00W090", lon: -90, lat: 90 },
  { name: "N00E000", lon: 0, lat: 90 },
  { name: "N00E090", lon: 90, lat: 90 },
  { name: "S90W180", lon: -180, lat: 0 },
  { name: "S90W090", lon: -90, lat: 0 },
  { name: "S90E000", lon: 0, lat: 0 },
  { name: "S90E090", lon: 90, lat: 0 },
];

export const RELIEF_SOURCE = {
  name: "SRTM15+ v2.7 via GMT earth_relief_03m",
  url: "https://www.generic-mapping-tools.org/remote-datasets/earth-relief.html",
  doi: "10.1029/2019EA000658",
};

/** `apps/server/data/relief/earth_relief_03m.i16`, resolved from `src/` under tsx and from `dist/` after build. */
export const DEFAULT_RELIEF_FILE = fileURLToPath(
  new URL("../../data/relief/earth_relief_03m.i16", import.meta.url),
);

/**
 * The JPEG 2000 codestream inside a JP2 container (its `jp2c` box); a bare codestream, which
 * starts with the SOC marker, is returned as it is.
 */
export function jp2Codestream(file: Uint8Array): Uint8Array {
  if (file[0] === 0xff && file[1] === 0x4f) return file;
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let off = 0;
  while (off + 8 <= file.length) {
    let len = view.getUint32(off);
    let header = 8;
    const type = String.fromCharCode(...file.subarray(off + 4, off + 8));
    if (len === 1) {
      len = Number(view.getBigUint64(off + 8));
      header = 16;
    } else if (len === 0) {
      len = file.length - off;
    }
    if (type === "jp2c") return file.subarray(off + header, off + len);
    off += len;
  }
  throw new Error("JP2: no codestream box");
}

/** Copies a decoded tile (row 0 at its north edge) into the grid at its corner, scaling to metres. */
export function placeTile(
  grid: Int16Array,
  tile: Int16Array,
  lon: number,
  lat: number,
  layout: ReliefLayout = RELIEF,
): void {
  const col0 = Math.round((lon + 180) / layout.cellDeg);
  const row0 = Math.round((90 - lat) / layout.cellDeg);
  const n = layout.tileSize;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      grid[(row0 + r) * layout.width + col0 + c] = Math.round(
        Number(tile[r * n + c]) * layout.scale,
      );
    }
  }
}

/** Bilinear elevation in metres at a lon/lat; longitude wraps, latitude clamps to the grid. */
export function sampleRelief(
  grid: Int16Array,
  lon: number,
  lat: number,
  layout: ReliefLayout = RELIEF,
): number {
  const cx = (lon + 180) / layout.cellDeg - 0.5;
  const cy = (90 - lat) / layout.cellDeg - 0.5;
  const x0 = Math.floor(cx);
  const y0 = Math.min(Math.max(Math.floor(cy), 0), layout.height - 2);
  const fx = cx - x0;
  const fy = Math.min(Math.max(cy - y0, 0), 1);
  const col = (c: number): number => ((c % layout.width) + layout.width) % layout.width;
  const at = (c: number, r: number): number => Number(grid[r * layout.width + col(c)]);
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** `n` elevations along the great circle from a to b, with their spacing. */
export function reliefAlong(
  grid: Int16Array,
  a: LonLat,
  b: LonLat,
  n: number,
  layout: ReliefLayout = RELIEF,
): ApiRelief {
  const metres: number[] = [];
  for (let i = 0; i < n; i++) {
    const [lon, lat] = slerp(a, b, i / (n - 1));
    metres.push(Math.round(sampleRelief(grid, lon, lat, layout)));
  }
  return { stepKm: distanceKm(a, b) / (n - 1), metres };
}

/** The raw grid as little-endian int16, or null when the file is absent. */
export function loadRelief(path: string): Int16Array | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}
