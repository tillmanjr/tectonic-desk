import type { VolcanoStatus } from "@tectonic/shared";
import type { Db } from "../db/client.js";
import { finishRun, startRun } from "../repositories/ingest-runs.js";
import { upsertReports } from "../repositories/volcano-reports.js";
import { recordStatuses } from "../repositories/volcano-status.js";
import type { VolcanoClient } from "../volcano/client.js";
import { parseGeonet, parseHans, parseWeeklyReport } from "../volcano/parse.js";
import type { IngestLogger } from "./context.js";
import { errorMessage } from "./feed.js";

export interface VolcanoContext {
  db: Db;
  volcano: VolcanoClient;
  log: IngestLogger;
  now: () => Date;
}

export interface StatusRunResult {
  runId: number;
  /** Statuses fetched per source; a source that failed is absent. */
  fetched: Record<string, number>;
  inserted: number;
}

/**
 * Polls USGS HANS and GeoNet and records every change of level, colour or
 * notice. A source that fails is logged and skipped; the run fails only when
 * both do.
 */
export async function syncVolcanoStatus(ctx: VolcanoContext): Promise<StatusRunResult> {
  const runId = await startRun(ctx.db, "volcano_status", {}, ctx.now());
  try {
    const observedAt = ctx.now();
    const fetched: Record<string, number> = {};
    const errors: string[] = [];
    const statuses: VolcanoStatus[] = [];
    const [usgs, geonet] = await Promise.allSettled([
      Promise.all([ctx.volcano.fetchHansMonitored(), ctx.volcano.fetchHansElevated()]).then(
        ([monitored, elevated]) => parseHans(monitored, elevated, observedAt),
      ),
      ctx.volcano.fetchGeonet().then((doc) => parseGeonet(doc, observedAt)),
    ]);
    for (const [name, settled] of [
      ["usgs", usgs],
      ["geonet", geonet],
    ] as const) {
      if (settled.status === "fulfilled") {
        fetched[name] = settled.value.length;
        statuses.push(...settled.value);
      } else {
        const message = errorMessage(settled.reason);
        errors.push(`${name}: ${message}`);
        ctx.log.warn({ source: name, err: settled.reason }, "volcano status source failed");
      }
    }
    if (statuses.length === 0 && errors.length > 0) throw new Error(errors.join("; "));
    const { inserted } = await recordStatuses(ctx.db, statuses);
    await finishRun(
      ctx.db,
      runId,
      {
        ok: true,
        eventsInserted: inserted,
        ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
      },
      ctx.now(),
    );
    ctx.log.info({ runId, fetched, inserted }, "volcano status sync complete");
    return { runId, fetched, inserted };
  } catch (err) {
    await finishRun(ctx.db, runId, { ok: false, error: errorMessage(err) }, ctx.now());
    throw err;
  }
}

export interface ReportRunResult {
  runId: number;
  entries: number;
  inserted: number;
  updated: number;
}

/** Fetches the weekly report RSS and upserts its entries; a blocked feed is a failed run, not a crash. */
export async function syncVolcanoReports(ctx: VolcanoContext): Promise<ReportRunResult> {
  const runId = await startRun(ctx.db, "volcano_reports", {}, ctx.now());
  try {
    const xml = await ctx.volcano.fetchWeeklyReport();
    const entries = parseWeeklyReport(xml, ctx.now());
    const { inserted, updated } = await upsertReports(ctx.db, entries);
    await finishRun(
      ctx.db,
      runId,
      { ok: true, eventsInserted: inserted, eventsUpdated: updated },
      ctx.now(),
    );
    ctx.log.info(
      { runId, entries: entries.length, inserted, updated },
      "weekly report sync complete",
    );
    return { runId, entries: entries.length, inserted, updated };
  } catch (err) {
    await finishRun(ctx.db, runId, { ok: false, error: errorMessage(err) }, ctx.now());
    throw err;
  }
}
