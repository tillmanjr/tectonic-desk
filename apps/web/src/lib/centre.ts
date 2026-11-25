/**
 * The global map's centre longitude: the default, its place in the route (`?lon=`), the slider that
 * runs either side of the default with a detent there, and how a longitude reads.
 */

/** The longitude the global map is centred on unless the reader turns it: the Pacific rim together. */
export const DEFAULT_CENTRE = 150;
/** Within this many degrees of the default the slider snaps to it. */
export const CENTRE_DETENT = 5;
/** Degrees a ‹ or › press turns the map. */
export const CENTRE_NUDGE = 15;

/** A longitude in (−180, 180]. */
export function wrapLon(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

/** The centre in the route: whole degrees, anything else or nothing the default. */
export function parseCentre(raw: unknown): number {
  if (typeof raw !== "string" || !/^-?\d{1,3}$/.test(raw)) return DEFAULT_CENTRE;
  const n = Number(raw);
  return Math.abs(n) <= 180 ? wrapLon(n) : DEFAULT_CENTRE;
}

/** The route's value for a centre; none at the default. */
export function centreQuery(lon: number): string | undefined {
  return lon === DEFAULT_CENTRE ? undefined : String(lon);
}

/** 150°E, 30°W, 0°, 180°. */
export function fmtLon(lon: number): string {
  if (lon === 0 || lon === 180) return `${String(lon)}°`;
  return `${String(Math.abs(lon))}°${lon > 0 ? "E" : "W"}`;
}

/** The slider's value for a centre: degrees east of the default, in (−180, 180]. */
export function offsetOf(lon: number): number {
  return wrapLon(lon - DEFAULT_CENTRE);
}

/** The centre for a slider value. */
export function lonOfOffset(offset: number): number {
  return wrapLon(DEFAULT_CENTRE + offset);
}

/** A dragged slider value, caught by the detent at the default. */
export function snapOffset(offset: number): number {
  return Math.abs(offset) <= CENTRE_DETENT ? 0 : offset;
}
