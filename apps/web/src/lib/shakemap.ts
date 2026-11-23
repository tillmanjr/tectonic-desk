import { mmiLevel, MMI_SCALE, type ApiShakeMap, type ShakeGrid } from "@tectonic/shared";
import { contours } from "d3-contour";
import type { MultiPolygon, Polygon, Position } from "geojson";
import { ApiRequestError, type ApiClient } from "./api.js";

/**
 * USGS ShakeMap intensity as filled bands: the MMI grid contoured at the half-integers that
 * separate the ShakeMap legend's levels, in lon/lat for geoPath on any projection, and a
 * nearest-node lookup for the readout under the pointer.
 */

export interface ShakeBand {
  /** The level whose lower bound this band starts at: everything inside is at least `mmi − 0.5`. */
  mmi: number;
  roman: string;
  color: string;
  shape: MultiPolygon;
}

/** Level II and up; level I ("not felt") is left clear so the band edge marks where it was felt. */
const BANDED = MMI_SCALE.filter((l) => l.mmi >= 2);

/** Whether the feed lists a ShakeMap product for the event. */
export function hasShakeMap(e: { types: readonly string[] }): boolean {
  return e.types.includes("shakemap");
}

/** The grid's filled bands, lowest first, so higher intensities paint over lower. */
export function shakeBands(grid: ShakeGrid): ShakeBand[] {
  const values = grid.mmi.map((v) => v ?? 0);
  const generator = contours().size([grid.nx, grid.ny]);
  // Contour vertices sit on cell edges; node i is the centre of cell [i, i + 1].
  const toLonLat = (p: Position): Position => [
    grid.lon0 + (Number(p[0]) - 0.5) * grid.dLon,
    grid.lat0 + (Number(p[1]) - 0.5) * grid.dLat,
  ];
  return BANDED.flatMap((level) => {
    const band = generator.contour(values, level.mmi - 0.5);
    if (band.coordinates.length === 0) return [];
    return [
      {
        mmi: level.mmi,
        roman: level.roman,
        color: level.color,
        shape: {
          type: "MultiPolygon" as const,
          coordinates: band.coordinates.map((rings) => rings.map((r) => r.map(toLonLat))),
        },
      },
    ];
  });
}

/**
 * The area the ShakeMap covers, as a closed ring (south-west, south-east, north-east,
 * north-west) with points every degree so the edges follow the projection. Its edge is where
 * USGS stopped computing, not an intensity boundary, so the map draws it dashed.
 */
export function shakeExtent(grid: ShakeGrid): Polygon {
  const west = grid.lon0;
  const south = grid.lat0;
  const east = west + (grid.nx - 1) * grid.dLon;
  const north = south + (grid.ny - 1) * grid.dLat;
  const steps = (span: number): number => Math.max(1, Math.ceil(span));
  type LonLat = [number, number];
  const along = (from: LonLat, to: LonLat): LonLat[] => {
    const n = steps(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])));
    return Array.from({ length: n }, (_, k) => [
      from[0] + ((to[0] - from[0]) * k) / n,
      from[1] + ((to[1] - from[1]) * k) / n,
    ]);
  };
  const sw: LonLat = [west, south];
  const se: LonLat = [east, south];
  const ne: LonLat = [east, north];
  const nw: LonLat = [west, north];
  // Clockwise with north up: d3-geo reads it as the small ring, not the rest of the sphere.
  const ring = [...along(sw, nw), ...along(nw, ne), ...along(ne, se), ...along(se, sw), sw];
  return { type: "Polygon", coordinates: [ring] };
}

/** The intensity at the node nearest a point, or null off the grid or where none was computed. */
export function mmiAt(grid: ShakeGrid, lon: number, lat: number): number | null {
  const east = (((lon - grid.lon0) % 360) + 360) % 360;
  const i = Math.round(east / grid.dLon);
  const j = Math.round((lat - grid.lat0) / grid.dLat);
  if (i >= grid.nx || j < 0 || j >= grid.ny) return null;
  return grid.mmi[j * grid.nx + i] ?? null;
}

/** "MMI 6.3 · VI, strong shaking, light damage" for the readout; null below level I. */
export function mmiText(mmi: number): string | null {
  const level = mmiLevel(mmi);
  if (level === null) return null;
  const damage = level.damage === "None" ? "no" : level.damage.toLowerCase();
  return `MMI ${mmi.toFixed(1)} · ${level.roman}, ${level.shaking.toLowerCase()} shaking, ${damage} damage`;
}

/** The legend's caption for a ShakeMap: who made it, which version, reviewed or not. */
export function shakeCaption(m: ApiShakeMap): string {
  const parts = [`USGS ShakeMap · ${m.source}`];
  if (m.version !== null) parts.push(`v${String(m.version)}`);
  if (m.mapStatus !== null) parts.push(m.mapStatus);
  if (m.maxMmi !== null) parts.push(`max MMI ${m.maxMmi.toFixed(1)}`);
  return parts.join(" · ");
}

let loaded = new Map<string, Promise<ApiShakeMap | null>>();

/**
 * An event's ShakeMap through the API, fetched once per page: null when the server has none
 * (404). A failed fetch is forgotten so the next request retries.
 */
export function loadShakeMap(api: ApiClient, eventId: string): Promise<ApiShakeMap | null> {
  let p = loaded.get(eventId);
  if (p === undefined) {
    p = api.shakemap(eventId).catch((e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      loaded.delete(eventId);
      throw e;
    });
    loaded.set(eventId, p);
  }
  return p;
}

/** Forgets every loaded ShakeMap; for tests. */
export function resetShakeCache(): void {
  loaded = new Map();
}
