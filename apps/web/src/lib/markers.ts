/**
 * How marker sizes shrink as the map zooms in: a marker drawn at `r` is
 * `r / k ** ZOOM_SHRINK` wide in map units, so it grows on screen by
 * `k ** (1 - ZOOM_SHRINK)`, about five times between zoom 1 and 40.
 */
export const ZOOM_SHRINK = 0.56;

/** Epicentre marker radius in viewBox units at zoom 1, from the floor the markers are scaled from. */
export function markerRadius(mag: number, minMag: number, global: boolean): number {
  return (global ? 0.8 : 0.9) + Math.max(0, mag - minMag + 0.3) ** 1.5 * 1.3;
}

/** Beachball edge length in viewBox units at zoom 1. */
export function beachballSize(mag: number, global: boolean): number {
  return global ? Math.max(10, (mag - 4) * 5.5) : Math.max(10, (mag - 2.4) * 6.5);
}
