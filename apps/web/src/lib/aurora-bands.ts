import { AURORA_CELLS, AURORA_HEIGHT, AURORA_THRESHOLDS, AURORA_WIDTH } from "@tectonic/shared";
import { contours } from "d3-contour";
import type { MultiPolygon, Position } from "geojson";
import { wrapLon } from "./sun.js";

/**
 * The OVATION grid as filled probability bands: one MultiPolygon per threshold, in lon/lat,
 * ready for geoPath on any projection. Contour vertices sit on cell edges, so they are moved
 * to cell centres, and an edge along a pole row is pulled in to ±89.9° so it stays a small
 * ring rather than collapsing to the pole.
 */

export interface AuroraBand {
  /** The threshold, percent: everything inside is at least this likely. */
  level: number;
  shape: MultiPolygon;
}

const POLE_CLAMP = 89.9;

/** The grid re-laid row by row (latitude-major) as d3-contour wants it. */
function rows(grid: Uint8Array): number[] {
  const out = new Array<number>(AURORA_CELLS);
  for (let lon = 0; lon < AURORA_WIDTH; lon++) {
    for (let y = 0; y < AURORA_HEIGHT; y++)
      out[y * AURORA_WIDTH + lon] = grid[lon * AURORA_HEIGHT + y] ?? 0;
  }
  return out;
}

const toLonLat = (p: Position): Position => [
  wrapLon(Number(p[0]) - 0.5),
  Math.max(-POLE_CLAMP, Math.min(POLE_CLAMP, Number(p[1]) - 90.5)),
];

/**
 * A polygon's rings in lon/lat. The grid-to-sphere mapping preserves orientation, so
 * d3-contour's winding comes through as the spherical winding d3-geo expects (the tests check
 * that no band covers more than a hemisphere).
 */
const spherical = (rings: Position[][]): Position[][] => rings.map((ring) => ring.map(toLonLat));

export function auroraBands(grid: Uint8Array): AuroraBand[] {
  const generator = contours()
    .size([AURORA_WIDTH, AURORA_HEIGHT])
    .thresholds([...AURORA_THRESHOLDS]);
  return generator(rows(grid)).map((band) => ({
    level: band.value,
    shape: { type: "MultiPolygon", coordinates: band.coordinates.map(spherical) },
  }));
}
