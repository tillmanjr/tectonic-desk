import type { ApiEvent, Volcano } from "@tectonic/shared";

/** A section line from A to A′ with the half-width of the corridor whose events it collects. */
export interface Section {
  /** lon, lat */
  a: [number, number];
  b: [number, number];
  halfKm: number;
}

export const DEFAULT_HALF_KM = 50;
export const HALF_KM_RANGE: [number, number] = [5, 500];
export const EARTH_RADIUS_KM = 6371;
/** Samples along the line for the drawn path and the corridor ring. */
const STEPS = 32;

type Vec = [number, number, number];
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const toVec = (lon: number, lat: number): Vec => {
  const φ = rad(lat);
  const λ = rad(lon);
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
};
const toLonLat = (v: Vec): [number, number] => [deg(Math.atan2(v[1], v[0])), deg(Math.asin(v[2]))];
const cross = (u: Vec, v: Vec): Vec => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const dot = (u: Vec, v: Vec): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const scale = (u: Vec, s: number): Vec => [u[0] * s, u[1] * s, u[2] * s];
const add = (u: Vec, v: Vec): Vec => [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
const norm = (u: Vec): Vec => scale(u, 1 / Math.hypot(u[0], u[1], u[2]));
const clamp1 = (x: number): number => Math.min(1, Math.max(-1, x));

const inRange = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;

/** `lon1,lat1,lon2,lat2,halfKm`; null when malformed, out of range or zero length. */
export function parseSection(v: unknown): Section | null {
  if (typeof v !== "string") return null;
  const parts = v.split(",");
  if (parts.length !== 5) return null;
  const at = (i: number): number => Number(parts[i]);
  const [lon1, lat1, lon2, lat2, half] = [at(0), at(1), at(2), at(3), at(4)];
  if (![lon1, lat1, lon2, lat2, half].every((n) => Number.isFinite(n))) return null;
  if (!inRange(lon1, -180, 180) || !inRange(lon2, -180, 180)) return null;
  if (!inRange(lat1, -90, 90) || !inRange(lat2, -90, 90)) return null;
  if (!inRange(half, HALF_KM_RANGE[0], HALF_KM_RANGE[1])) return null;
  if (lon1 === lon2 && lat1 === lat2) return null;
  return { a: [lon1, lat1], b: [lon2, lat2], halfKm: half };
}

const three = (n: number): string => String(Math.round(n * 1000) / 1000);

/** The query value: ends at three decimals, the half-width at none. */
export const sectionQuery = (s: Section): string =>
  [three(s.a[0]), three(s.a[1]), three(s.b[0]), three(s.b[1]), String(Math.round(s.halfKm))].join(
    ",",
  );

/** Great-circle length, km. */
export function lengthKm(s: Section): number {
  const a = toVec(s.a[0], s.a[1]);
  const b = toVec(s.b[0], s.b[1]);
  return Math.acos(clamp1(dot(a, b))) * EARTH_RADIUS_KM;
}

/** Initial bearing at A, degrees clockwise from north in [0, 360). */
export function azimuth(s: Section): number {
  const φ1 = rad(s.a[1]);
  const φ2 = rad(s.b[1]);
  const dλ = rad(s.b[0] - s.a[0]);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** "N 84° E" style compass text for a bearing. */
export function azimuthText(bearing: number): string {
  const d = ((bearing % 360) + 360) % 360;
  const say = (ns: string, n: number, ew: string): string =>
    `${ns} ${String(Math.round(n))}° ${ew}`;
  if (d <= 90) return say("N", d, "E");
  if (d < 180) return say("S", 180 - d, "E");
  if (d < 270) return say("S", d - 180, "W");
  return say("N", 360 - d, "W");
}

export interface Projected {
  /** 0 at A, the line's length at A′; negative before A. */
  alongKm: number;
  /** Signed: positive to the right of travel from A to A′. */
  offKm: number;
}

/** The great-circle normal, pointing left of travel from A to A′. */
const normalOf = (s: Section): Vec => norm(cross(toVec(s.a[0], s.a[1]), toVec(s.b[0], s.b[1])));

/** Where a point falls relative to the line, by great-circle geometry. */
export function projectOnto(s: Section, lon: number, lat: number): Projected {
  const a = toVec(s.a[0], s.a[1]);
  const n = normalOf(s);
  const p = toVec(lon, lat);
  const side = dot(p, n);
  const onPlane = norm(add(p, scale(n, -side)));
  const along = Math.atan2(dot(cross(a, onPlane), n), dot(a, onPlane));
  return { alongKm: along * EARTH_RADIUS_KM, offKm: -Math.asin(clamp1(side)) * EARTH_RADIUS_KM };
}

export interface ProfilePoint {
  id: string;
  alongKm: number;
  depthKm: number;
  mag: number | null;
  event: ApiEvent;
}
export interface Profile {
  /** In order along the line. */
  points: ProfilePoint[];
  /** Corridor events without a reported depth, which the profile cannot place. */
  noDepth: number;
}

const inCorridor = (s: Section, p: Projected, length: number): boolean =>
  Math.abs(p.offKm) <= s.halfKm && p.alongKm >= 0 && p.alongKm <= length;

/** The corridor's events with a depth, projected onto the line. */
export function profileOf(s: Section, events: ApiEvent[]): Profile {
  const length = lengthKm(s);
  const points: ProfilePoint[] = [];
  let noDepth = 0;
  for (const e of events) {
    const p = projectOnto(s, e.longitude, e.latitude);
    if (!inCorridor(s, p, length)) continue;
    if (e.depthKm === null) {
      noDepth++;
      continue;
    }
    points.push({ id: e.id, alongKm: p.alongKm, depthKm: e.depthKm, mag: e.mag, event: e });
  }
  points.sort((x, y) => x.alongKm - y.alongKm);
  return { points, noDepth };
}

export interface SurfacePoint {
  number: number;
  name: string;
  alongKm: number;
}

/** The corridor's volcanoes along the line, for the surface of the profile. */
export function surfacePointsOf(s: Section, volcanoes: Volcano[]): SurfacePoint[] {
  const length = lengthKm(s);
  const out: SurfacePoint[] = [];
  for (const v of volcanoes) {
    const p = projectOnto(s, v.lon, v.lat);
    if (inCorridor(s, p, length)) out.push({ number: v.number, name: v.name, alongKm: p.alongKm });
  }
  return out.sort((x, y) => x.alongKm - y.alongKm);
}

/** The lon/lat `t` of the way from A to A′ along the great circle. */
export function pointAlong(s: Section, t: number): [number, number] {
  const a = toVec(s.a[0], s.a[1]);
  const b = toVec(s.b[0], s.b[1]);
  const ω = Math.acos(clamp1(dot(a, b)));
  const sinω = Math.sin(ω);
  const u = add(scale(a, Math.sin((1 - t) * ω) / sinω), scale(b, Math.sin(t * ω) / sinω));
  return toLonLat(norm(u));
}

/** The corridor as a closed lon/lat ring: the left edge from A to A′, the right edge back. */
export function corridorRing(s: Section): [number, number][] {
  const n = normalOf(s);
  const δ = s.halfKm / EARTH_RADIUS_KM;
  const edge = (sign: 1 | -1): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = sign === 1 ? i / STEPS : 1 - i / STEPS;
      const [lon, lat] = pointAlong(s, t);
      const q = toVec(lon, lat);
      pts.push(toLonLat(norm(add(scale(q, Math.cos(δ)), scale(n, sign * Math.sin(δ))))));
    }
    return pts;
  };
  const left = edge(1);
  return [...left, ...edge(-1), ...left.slice(0, 1)];
}

/** The line itself as samples along the great circle, for drawing. */
export const linePoints = (s: Section): [number, number][] =>
  Array.from({ length: STEPS + 1 }, (_, i) => pointAlong(s, i / STEPS));
