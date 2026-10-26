import {
  AURORA_CELLS,
  AURORA_HEIGHT,
  AURORA_WIDTH,
  auroraIndex as cellIndex,
  type ApiAuroraFrame,
  type ApiAuroraFrameMeta,
  type ApiAuroraIndex,
} from "@tectonic/shared";
import { SPACE_NOW } from "./space.js";

const NOW_MS = Date.parse(SPACE_NOW);
const MIN = 60_000;

/** Percent by distance in degrees from the oval's centre line, 80 on it and nothing past 3°. */
const PROFILE = [80, 50, 25, 12];

/**
 * A synthetic OVATION grid: two ovals centred on ±67° latitude, three degrees wide, peaking
 * at 80 %, with a brighter midnight sector so the result is not symmetric about the pole.
 */
export function ringGrid(): Uint8Array {
  const grid = new Uint8Array(AURORA_CELLS);
  for (let lon = 0; lon < AURORA_WIDTH; lon++) {
    const boost = lon >= 160 && lon <= 200 ? 15 : 0;
    for (let y = 0; y < AURORA_HEIGHT; y++) {
      const lat = y - 90;
      const d = Math.min(Math.abs(Math.abs(lat) - 67), PROFILE.length);
      const v = PROFILE[d];
      if (v !== undefined) grid[cellIndex(lon, lat)] = Math.min(100, v + boost);
    }
  }
  return grid;
}

/** A grid of one value everywhere poleward of `fromLat` (both poles): a filled cap. */
export function capGrid(fromLat: number, value: number): Uint8Array {
  const grid = new Uint8Array(AURORA_CELLS);
  for (let lon = 0; lon < AURORA_WIDTH; lon++) {
    for (let y = 0; y < AURORA_HEIGHT; y++) {
      if (Math.abs(y - 90) >= fromLat) grid[cellIndex(lon, y - 90)] = value;
    }
  }
  return grid;
}

export function encodeGrid(grid: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < grid.length; i += 4096) {
    bin += String.fromCharCode(...grid.subarray(i, i + 4096));
  }
  return btoa(bin);
}

/** A frame observed `minutesAgo` before now, forecast 75 minutes on. */
export function auroraMeta(
  minutesAgo: number,
  over: Partial<ApiAuroraFrameMeta> = {},
): ApiAuroraFrameMeta {
  const observed = NOW_MS - minutesAgo * MIN;
  return {
    observed: new Date(observed).toISOString(),
    forecast: new Date(observed + 75 * MIN).toISOString(),
    powerNorth: 19.9,
    powerSouth: 19.2,
    ...over,
  };
}

/** Three frames five minutes apart, the newest ten minutes old. */
export function auroraIndex(over: Partial<ApiAuroraIndex> = {}): ApiAuroraIndex {
  return {
    generatedAt: SPACE_NOW,
    frames: [auroraMeta(20), auroraMeta(15), auroraMeta(10)],
    ...over,
  };
}

export function auroraFrame(
  minutesAgo = 10,
  over: Partial<ApiAuroraFrame> = {},
  grid: Uint8Array = ringGrid(),
): ApiAuroraFrame {
  return { ...auroraMeta(minutesAgo), grid: encodeGrid(grid), ...over };
}
