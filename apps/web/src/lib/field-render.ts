/**
 * Rendering primitives for the gravity and magnetic rasters: grid sampling, the USGS Albers
 * projection, colour ramps and the pixel loop. Pure, so the generator script and the tests
 * share them; nothing here touches files or the DOM.
 */

export interface LonLatGrid {
  width: number;
  height: number;
  /** Row-major, row 0 at the south edge, column 0 at -180, pixel-registered; NaN for no data. */
  values: Float32Array;
}

/** A weighted term; a missing neighbour only matters when its weight is positive. */
const term = (w: number, v: number): number => (w === 0 ? 0 : w * v);

/** Bilinear blend of the four neighbours (a b / c d) at fractions fx, fy. */
function lerp2(a: number, b: number, c: number, d: number, fx: number, fy: number): number {
  return (
    term((1 - fx) * (1 - fy), a) + term(fx * (1 - fy), b) + term((1 - fx) * fy, c) + term(fx * fy, d)
  );
}

/** Bilinear value at a lon/lat; NaN when a neighbour is missing. Longitude wraps, latitude clamps. */
export function sampleLonLat(g: LonLatGrid, lon: number, lat: number): number {
  const cx = ((lon + 180) / 360) * g.width - 0.5;
  const cy = ((lat + 90) / 180) * g.height - 0.5;
  const x0 = Math.floor(cx);
  const y0 = Math.min(Math.max(Math.floor(cy), 0), g.height - 2);
  const fx = cx - x0;
  const fy = Math.min(Math.max(cy - y0, 0), 1);
  const col = (c: number): number => ((c % g.width) + g.width) % g.width;
  const at = (c: number, r: number): number => Number(g.values[r * g.width + col(c)]);
  return lerp2(at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx, fy);
}

export interface ProjectedGrid {
  width: number;
  height: number;
  /** Row-major from the grid's own origin; NaN for a dummy. */
  values: Float32Array;
  /** Fractional column and row for a lon/lat, or null when the point is off the grid. */
  locate(lon: number, lat: number): [number, number] | null;
}

/** Bilinear value at a lon/lat through the grid's own projection; NaN off the grid or by a dummy. */
export function sampleProjected(g: ProjectedGrid, lon: number, lat: number): number {
  const p = g.locate(lon, lat);
  if (p === null) return NaN;
  const [cx, cy] = p;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= g.width || y0 + 1 >= g.height) return NaN;
  const at = (c: number, r: number): number => Number(g.values[r * g.width + c]);
  return lerp2(at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1), cx - x0, cy - y0);
}

export interface AlbersParams {
  /** Semi-major axis, metres. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Standard parallels, degrees. */
  lat1: number;
  lat2: number;
  /** Origin, degrees. */
  lat0: number;
  lon0: number;
  /** Metres at the grid's north-west node. */
  xOrigin: number;
  yOrigin: number;
}

/** USGS DDS-9 gravity grids: NAD27 Clarke 1866, Albers 29.5/45.5, origin 0/-96, 4 km cells. */
export const DDS9_ALBERS: AlbersParams = {
  a: 6378206.4,
  e: 0.08227185422,
  lat1: 29.5,
  lat2: 45.5,
  lat0: 0,
  lon0: -96,
  xOrigin: -2574000,
  yOrigin: 2539000,
};

const rad = (d: number): number => (d * Math.PI) / 180;
function q(e: number, lat: number): number {
  const s = Math.sin(lat);
  return (
    (1 - e * e) * (s / (1 - e * e * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s)))
  );
}
function m(e: number, lat: number): number {
  const s = Math.sin(lat);
  return Math.cos(lat) / Math.sqrt(1 - e * e * s * s);
}

/** Ellipsoidal Albers equal-area forward projection (Snyder 1987, equations 14-1 to 14-12). */
export function albersForward(p: AlbersParams, lon: number, lat: number): [number, number] {
  const { a, e } = p;
  const m1 = m(e, rad(p.lat1));
  const m2 = m(e, rad(p.lat2));
  const q1 = q(e, rad(p.lat1));
  const q2 = q(e, rad(p.lat2));
  const q0 = q(e, rad(p.lat0));
  const n = (m1 * m1 - m2 * m2) / (q2 - q1);
  const c = m1 * m1 + n * q1;
  const rho0 = (a * Math.sqrt(c - n * q0)) / n;
  const rho = (a * Math.sqrt(c - n * q(e, rad(lat)))) / n;
  const theta = n * rad(lon - p.lon0);
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

/** Blue to red through near-white, at reduced chroma so marker colours stay distinct. */
export const RAMP = ["#2f5f9e", "#8db0d6", "#efeee9", "#dc9a84", "#a63d2f"] as const;

/** Stops spread evenly from -limit to +limit over the ramp. */
export function linearStops(limit: number, ramp: readonly string[]): [number, string][] {
  const n = ramp.length - 1;
  return ramp.map((c, i) => [-limit + (2 * limit * i) / n, c]);
}

/** Stops at evenly spaced percentiles of the finite values, so each band holds equal area. */
export function equalisedStops(values: Float32Array, ramp: readonly string[]): [number, string][] {
  const finite = Array.from(values)
    .filter((v) => Number.isFinite(v))
    .sort((x, y) => x - y);
  const n = ramp.length - 1;
  return ramp.map((c, i) => {
    const pos = (i / n) * (finite.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, finite.length - 1);
    const a = finite[lo] ?? 0;
    const b = finite[hi] ?? a;
    return [a + (b - a) * (pos - lo), c];
  });
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The colour for a value: interpolated between its two stops, clamped at the ends. */
export function colourAt(stops: [number, string][], v: number): Rgb {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) return [0, 0, 0];
  if (v <= first[0]) return rgb(first[1]);
  if (v >= last[0]) return rgb(last[1]);
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i];
    const lo = stops[i - 1];
    if (hi === undefined || lo === undefined || v > hi[0]) continue;
    const t = (v - lo[0]) / (hi[0] - lo[0]);
    const a = rgb(lo[1]);
    const b = rgb(hi[1]);
    const mix = (k: 0 | 1 | 2): number => Math.round(a[k] + (b[k] - a[k]) * t);
    return [mix(0), mix(1), mix(2)];
  }
  return rgb(last[1]);
}

/**
 * RGBA bytes for a width × height image: each pixel centre is inverted to a lon/lat, sampled
 * and coloured; pixels off the map or on missing data stay transparent.
 */
export function renderRaster(
  width: number,
  height: number,
  invert: (x: number, y: number) => [number, number] | null,
  sample: (lon: number, lat: number) => number,
  stops: [number, string][],
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ll = invert(x + 0.5, y + 0.5);
      if (ll === null) continue;
      const v = sample(ll[0], ll[1]);
      if (!Number.isFinite(v)) continue;
      const [r, g, b] = colourAt(stops, v);
      const i = (y * width + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}
