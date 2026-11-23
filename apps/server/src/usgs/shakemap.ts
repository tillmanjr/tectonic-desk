import type { ShakeGrid, ShakeMap } from "@tectonic/shared";
import { z } from "zod";
import type { DetailDocument } from "./schema.js";

/**
 * ShakeMap from an event's detail document: the preferred `shakemap` product and its medium
 * resolution MMI coverage (CoverageJSON, a regular CRS84 grid, about 150 × 150 nodes).
 */

export const COVERAGE_FILE = "download/coverage_mmi_medium_res.covjson";

const shakeProductSchema = z
  .object({
    source: z.string(),
    updateTime: z.number(),
    preferredWeight: z.number().default(0),
    properties: z.record(z.string(), z.string()),
    contents: z.record(z.string(), z.object({ url: z.string() }).loose()),
  })
  .loose();

export interface ShakeProduct {
  source: string;
  version: number | null;
  mapStatus: string | null;
  processed: Date | null;
  maxMmi: number | null;
  coverageUrl: string;
}

const numberOr = (v: string | undefined): number | null => {
  const n = v === undefined ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
const dateOr = (v: string | undefined): Date | null => {
  const ms = v === undefined ? Number.NaN : Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms);
};

/**
 * The preferred ShakeMap with an MMI coverage: highest `preferredWeight`, then newest. Products
 * that fail the schema or lack the coverage file are skipped; null when none is left.
 */
export function pickShakeProduct(detail: DetailDocument): ShakeProduct | null {
  const candidates = (detail.properties.products?.shakemap ?? [])
    .map((p) => shakeProductSchema.safeParse(p))
    .flatMap((r) => (r.success ? [r.data] : []))
    .filter((p) => p.contents[COVERAGE_FILE] !== undefined)
    .sort((a, b) => b.preferredWeight - a.preferredWeight || b.updateTime - a.updateTime);
  const best = candidates[0];
  const coverage = best?.contents[COVERAGE_FILE];
  if (best === undefined || coverage === undefined) return null;
  const props = best.properties;
  return {
    source: best.source,
    version: numberOr(props.version),
    mapStatus: props["map-status"] ?? null,
    processed: dateOr(props["process-timestamp"]),
    maxMmi: numberOr(props.maxmmi),
    coverageUrl: coverage.url,
  };
}

const axisSchema = z.object({ start: z.number(), stop: z.number(), num: z.number().int().min(2) });
export const coverageSchema = z
  .object({
    domain: z.object({ axes: z.object({ x: axisSchema, y: axisSchema }).loose() }).loose(),
    ranges: z
      .object({
        MMI: z
          .object({
            axisNames: z.tuple([z.literal("y"), z.literal("x")]),
            values: z.array(z.number().nullable()),
          })
          .loose(),
      })
      .loose(),
  })
  .loose();

/** Rounds to a tenth, the precision ShakeMap publishes, so the wire carries no float noise. */
const tenth = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

/**
 * The coverage as a grid from its south-west corner. Either axis may run downwards; rows and
 * columns are reordered so both increase. Throws when the values do not fill the grid.
 */
export function parseCoverage(doc: unknown): ShakeGrid {
  const c = coverageSchema.parse(doc);
  const { x, y } = c.domain.axes;
  const { values } = c.ranges.MMI;
  const nx = x.num;
  const ny = y.num;
  if (values.length !== nx * ny) {
    throw new Error(`coverage holds ${String(values.length)} values for ${String(nx * ny)} nodes`);
  }
  const rows = Array.from({ length: ny }, (_, j) => values.slice(j * nx, (j + 1) * nx));
  if (y.stop < y.start) rows.reverse();
  const mmi = rows.flatMap((r) => (x.stop < x.start ? r.reverse() : r)).map(tenth);
  return {
    lon0: Math.min(x.start, x.stop),
    lat0: Math.min(y.start, y.stop),
    dLon: Math.abs(x.stop - x.start) / (nx - 1),
    dLat: Math.abs(y.stop - y.start) / (ny - 1),
    nx,
    ny,
    mmi,
  };
}

/** The wire-ready ShakeMap for an event from its product and parsed grid. */
export function shakeMapOf(eventId: string, p: ShakeProduct, grid: ShakeGrid): ShakeMap {
  return {
    eventId,
    source: p.source,
    version: p.version,
    mapStatus: p.mapStatus,
    processed: p.processed,
    maxMmi: p.maxMmi,
    grid,
  };
}
