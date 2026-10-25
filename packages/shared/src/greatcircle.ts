/** Great-circle geometry on a sphere, shared by the section tool in the web and the relief route on the server. */

export type LonLat = [number, number];
type Vec = [number, number, number];
export const EARTH_RADIUS_KM = 6371;

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Unit vector for a lon/lat. */
export function toVec(p: LonLat): Vec {
  const φ = rad(p[1]);
  const λ = rad(p[0]);
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

/** Lon/lat for a unit vector. */
export function toLonLat(v: Vec): LonLat {
  return [deg(Math.atan2(v[1], v[0])), deg(Math.asin(Math.min(1, Math.max(-1, v[2]))))];
}

const dot = (u: Vec, v: Vec): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

/** Central angle between two points, radians. */
export function angleBetween(a: LonLat, b: LonLat): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(toVec(a), toVec(b)))));
}

/** Great-circle distance, km. */
export function distanceKm(a: LonLat, b: LonLat): number {
  return angleBetween(a, b) * EARTH_RADIUS_KM;
}

/** The point `t` (0..1) of the way from a to b along the great circle; a itself when they coincide. */
export function slerp(a: LonLat, b: LonLat, t: number): LonLat {
  if (a[0] === b[0] && a[1] === b[1]) return a;
  const ω = angleBetween(a, b);
  const va = toVec(a);
  const vb = toVec(b);
  const wa = Math.sin((1 - t) * ω) / Math.sin(ω);
  const wb = Math.sin(t * ω) / Math.sin(ω);
  return toLonLat([va[0] * wa + vb[0] * wb, va[1] * wa + vb[1] * wb, va[2] * wa + vb[2] * wb]);
}
