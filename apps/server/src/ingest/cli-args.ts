import { bboxString } from "../api/schemas.js";
import type { BackfillOptions } from "./backfill.js";

/** The `parseArgs` values the backfill command understands. */
export interface BackfillArgs {
  days?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  "min-magnitude"?: string | undefined;
  "all-magnitudes"?: boolean | undefined;
  bbox?: string | undefined;
  force?: boolean | undefined;
  "skip-details"?: boolean | undefined;
  "pause-ms"?: string | undefined;
}

const DAY_MS = 86_400_000;

export function positiveInt(v: string | undefined, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

function date(v: string, name: string): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`${name} must be an ISO date or date-time`);
  return d;
}

function startOf(v: BackfillArgs, now: Date): Date {
  if (v.days !== undefined && v.from !== undefined) {
    throw new Error("use --days or --from, not both");
  }
  const days = positiveInt(v.days, "--days");
  if (days !== undefined) return new Date(now.getTime() - days * DAY_MS);
  if (v.from !== undefined) return date(v.from, "--from");
  throw new Error("--days or --from is required");
}

function floorOf(v: BackfillArgs): number | null {
  const m = v["min-magnitude"];
  if (m !== undefined && v["all-magnitudes"] === true) {
    throw new Error("use --min-magnitude or --all-magnitudes, not both");
  }
  if (v["all-magnitudes"] === true) return null;
  if (m === undefined) return 2.5;
  const n = Number(m);
  if (!Number.isFinite(n)) throw new Error("--min-magnitude must be a number");
  return n;
}

/** Turns the CLI flags into backfill options; every rejection names the flag. */
export function parseBackfillArgs(v: BackfillArgs, now: Date): BackfillOptions {
  const from = startOf(v, now);
  const to = v.to === undefined ? now : date(v.to, "--to");
  if (to.getTime() <= from.getTime()) throw new Error("--to must be after --from");
  const opts: BackfillOptions = { from, to, minMagnitude: floorOf(v) };
  if (v.bbox !== undefined) {
    const parsed = bboxString.safeParse(v.bbox);
    if (!parsed.success) throw new Error("--bbox must be minLon,minLat,maxLon,maxLat");
    if (parsed.data.minLon > parsed.data.maxLon) {
      throw new Error("--bbox must not cross the antimeridian; USGS queries cannot wrap");
    }
    opts.bbox = parsed.data;
  }
  if (v.force === true) opts.force = true;
  if (v["skip-details"] === true) opts.skipDetails = true;
  const pause = v["pause-ms"];
  if (pause !== undefined) {
    const n = Number(pause);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error("--pause-ms must be a whole number of milliseconds");
    }
    opts.pauseMs = n;
  }
  return opts;
}
