import type { ApiShakeMap, ShakeGrid } from "@tectonic/shared";

/**
 * A 9 × 9 grid, 0.5° apart, centred on (lon, lat) (the fixture event by default), peaking at
 * `peak` and falling one MMI unit per node outwards (Chebyshev distance), corners uncomputed.
 */
export function coneGrid(lon = -175.1452, lat = -18.723, peak = 7.2): ShakeGrid {
  const n = 9;
  const mmi: (number | null)[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const corner = (i === 0 || i === n - 1) && (j === 0 || j === n - 1);
      const d = Math.max(Math.abs(i - 4), Math.abs(j - 4));
      mmi.push(corner ? null : Math.round((peak - d) * 10) / 10);
    }
  }
  return { lon0: lon - 2, lat0: lat - 2, dLon: 0.5, dLat: 0.5, nx: n, ny: n, mmi };
}

export function shakeMap(over: Partial<ApiShakeMap> = {}): ApiShakeMap {
  return {
    eventId: "us1",
    source: "us",
    version: 4,
    mapStatus: "reviewed",
    processed: "2026-10-12T06:00:00.000Z",
    maxMmi: 7.2,
    grid: coneGrid(),
    ...over,
  };
}
