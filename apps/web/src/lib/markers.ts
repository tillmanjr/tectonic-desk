/** Epicentre marker radius in viewBox units at zoom 1. */
export function markerRadius(mag: number, minMag: number, global: boolean): number {
  return global
    ? 1.6 + Math.max(0, mag - minMag + 0.4) ** 1.55 * 2.6
    : 1.8 + Math.max(0, mag - minMag + 0.3) ** 1.5 * 2.6;
}

/** Beachball edge length in viewBox units at zoom 1. */
export function beachballSize(mag: number, global: boolean): number {
  return global ? Math.max(16, (mag - 4) * 9) : Math.max(15, (mag - 2.4) * 11);
}
