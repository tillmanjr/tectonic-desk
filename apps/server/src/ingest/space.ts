import { AURORA_RETENTION_HOURS } from "@tectonic/shared";
import type { Db } from "../db/client.js";
import {
  downsampleBefore,
  insertAlerts,
  insertAuroraFrame,
  pruneAurora,
  upsertFlares,
  upsertSamples,
  upsertScales,
  type DownsampleResult,
} from "../repositories/space.js";
import type { SpaceClient } from "../space/client.js";
import type { HistoryClient } from "../space/history-client.js";
import {
  kpMaxByDay,
  parseAlerts,
  parseAuroraFrame,
  parseDst,
  hemiPowerSamples,
  parseFlares,
  parseKp1m,
  parseHemiPower,
  parseKp3h,
  parseMag,
  parseProtons,
  parseScales,
  parseWind,
  parseXrays,
  withPower,
  type HemiPowerRow,
} from "../space/parse.js";
import type { IngestLogger } from "./context.js";
import { errorMessage } from "./feed.js";

export interface SpaceContext {
  db: Db;
  space: SpaceClient;
  /** GFZ and Kyoto, for the long record. */
  history: HistoryClient;
  log: IngestLogger;
  now: () => Date;
}

/** Rows written per file; a file that failed is listed in `failed` instead. */
export interface SpaceRunResult {
  written: Record<string, number>;
  failed: string[];
}

/** One-minute rows are kept this long before the prune thins them to 5-minute means. */
export const FINE_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface Part {
  name: string;
  run: () => Promise<number>;
}

/**
 * Runs a job's parts together; each fetches one SWPC file, parses it and writes its rows. A
 * part that fails is logged and skipped so the others still land; the run itself fails only
 * when every part did, which the scheduler then logs.
 */
export async function runParts(
  ctx: SpaceContext,
  job: string,
  parts: Part[],
): Promise<SpaceRunResult> {
  const outcomes = await Promise.all(
    parts.map(async (p) => {
      try {
        return { name: p.name, written: await p.run(), err: null };
      } catch (err: unknown) {
        return { name: p.name, written: null, err };
      }
    }),
  );
  const written: Record<string, number> = {};
  const failed: string[] = [];
  const reasons: string[] = [];
  for (const o of outcomes) {
    if (o.written !== null) {
      written[o.name] = o.written;
    } else {
      failed.push(o.name);
      reasons.push(`${o.name}: ${errorMessage(o.err)}`);
      ctx.log.warn({ job, file: o.name, err: o.err }, "space weather file failed");
    }
  }
  if (failed.length === parts.length) throw new Error(reasons.join("; "));
  ctx.log.info({ job, written, failed }, "space weather sync complete");
  return { written, failed };
}

/**
 * The newest OVATION frame with its hemispheric power, then the frames past their retention
 * go. A power file that fails leaves the pair null rather than losing the frame. The power
 * rows also land in the samples table as two series at their forecast times.
 */
async function syncAurora(ctx: SpaceContext): Promise<number> {
  const frame = parseAuroraFrame(await ctx.space.fetchAurora());
  let power: HemiPowerRow[] = [];
  try {
    power = parseHemiPower(await ctx.space.fetchHemiPower());
  } catch (err: unknown) {
    ctx.log.warn({ job: "space_fast", file: "hemi_power", err }, "hemispheric power unavailable");
  }
  const inserted = await insertAuroraFrame(ctx.db, withPower(frame, power));
  await upsertSamples(ctx.db, hemiPowerSamples(power));
  await pruneAurora(ctx.db, new Date(ctx.now().getTime() - AURORA_RETENTION_HOURS * HOUR_MS));
  return inserted;
}

/** Kp 1-minute, solar wind, GOES fluxes and the aurora frame: the five-minute job. */
export function syncSpaceFast(ctx: SpaceContext): Promise<SpaceRunResult> {
  const { db, space } = ctx;
  return runParts(ctx, "space_fast", [
    { name: "aurora", run: () => syncAurora(ctx) },
    { name: "kp_1m", run: async () => upsertSamples(db, parseKp1m(await space.fetchKp1m())) },
    { name: "mag", run: async () => upsertSamples(db, parseMag(await space.fetchMag())) },
    { name: "wind", run: async () => upsertSamples(db, parseWind(await space.fetchWind())) },
    { name: "xrays", run: async () => upsertSamples(db, parseXrays(await space.fetchXrays())) },
    {
      name: "protons",
      run: async () => upsertSamples(db, parseProtons(await space.fetchProtons())),
    },
  ]);
}

/** Flares, alerts and the NOAA scales with their Kp maxima: the other five-minute job. */
export function syncSpaceEvents(ctx: SpaceContext): Promise<SpaceRunResult> {
  const { db, space } = ctx;
  return runParts(ctx, "space_events", [
    { name: "flares", run: async () => upsertFlares(db, parseFlares(await space.fetchFlares())) },
    { name: "alerts", run: async () => insertAlerts(db, parseAlerts(await space.fetchAlerts())) },
    {
      name: "scales",
      run: async () => {
        const [doc, forecast] = await Promise.all([space.fetchScales(), space.fetchKpForecast()]);
        return upsertScales(db, parseScales(doc, kpMaxByDay(forecast)));
      },
    },
  ]);
}

/** Three-hour Kp and hourly Dst: the hourly job. */
export function syncSpaceSlow(ctx: SpaceContext): Promise<SpaceRunResult> {
  const { db, space } = ctx;
  return runParts(ctx, "space_slow", [
    { name: "kp_3h", run: async () => upsertSamples(db, parseKp3h(await space.fetchKp3h())) },
    { name: "dst", run: async () => upsertSamples(db, parseDst(await space.fetchDst())) },
  ]);
}

/** Thins rows older than the fine retention to 5-minute means. */
export async function pruneSpace(ctx: SpaceContext): Promise<DownsampleResult> {
  const cutoff = new Date(ctx.now().getTime() - FINE_RETENTION_DAYS * DAY_MS);
  const result = await downsampleBefore(ctx.db, cutoff);
  ctx.log.info({ job: "space_prune", cutoff, ...result }, "space weather prune complete");
  return result;
}
