/**
 * Where the Sun is overhead. The low-precision solar position (mean anomaly, ecliptic
 * longitude, obliquity, sidereal time) is good to a few tenths of a degree, which is all a
 * night-side shading and a noon-up orientation need.
 */

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** An angle folded into (-180, 180]. */
export function wrapLon(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

/** `[lon, lat]` of the subsolar point at `date`. */
export function subsolarPoint(date: Date): [number, number] {
  const d = (date.getTime() - J2000_MS) / DAY_MS;
  const g = rad(357.529 + 0.98560028 * d);
  const q = 280.459 + 0.98564736 * d;
  const lambda = rad(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * d);
  const declination = deg(Math.asin(Math.sin(e) * Math.sin(lambda)));
  const rightAscension = deg(Math.atan2(Math.cos(e) * Math.sin(lambda), Math.cos(lambda)));
  const siderealTime = 280.46061837 + 360.98564736629 * d;
  return [wrapLon(rightAscension - siderealTime), declination];
}
