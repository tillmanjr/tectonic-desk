import type { VolcanoStatus } from "@tectonic/shared";
import type { Db } from "../db/client.js";
import { finishRun, startRun } from "../repositories/ingest-runs.js";
import { upsertReports } from "../repositories/volcano-reports.js";
import { recordStatuses } from "../repositories/volcano-status.js";
import type { VolcanoClient } from "../volcano/client.js";
import {
  isElevatedUsgs,
  noticeIdOf,
  noticeSynopsis,
  parseGeonet,
  parseHans,
  parseWeeklyReport,
} from "../volcano/parse.js";
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
 * Fills the synopsis of USGS statuses from their current notice: one fetch per
 * distinct notice among the elevated volcanoes (an observatory's daily update
 * covers all of them). A notice that fails to load is logged and leaves its
 * volcanoes' synopsis null.
 */
async function withSynopses(
  statuses: VolcanoStatus[],
  ctx: VolcanoContext,
): Promise<VolcanoStatus[]> {
  const ids = new Set<string>();
  for (const s of statuses) {
    const id = noticeIdOf(s.url);
    if (id !== null && isElevatedUsgs(s)) ids.add(id);
  }
  const texts = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        texts.set(id, await ctx.volcano.fetchHansNoticeText(id));
      } catch (err) {
        ctx.log.warn({ notice: id, err }, "HANS notice unavailable");
      }
    }),
  );
  return statuses.map((s) => {
    const id = noticeIdOf(s.url);
    const text = id === null ? undefined : texts.get(id);
    return text === undefined ? s : { ...s, synopsis: noticeSynopsis(text, s.key) };
  });
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
        ([monitored, elevated]) => withSynopses(parseHans(monitored, elevated, observedAt), ctx),
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

/** Fetches the weekly report RSS (the feed or its mirror) and upserts its entries; a blocked feed is a failed run, not a crash. */
export async function syncVolcanoReports(ctx: VolcanoContext): Promise<ReportRunResult> {
  const runId = await startRun(ctx.db, "volcano_reports", {}, ctx.now());
  try {
    const { xml, url } = await ctx.volcano.fetchWeeklyReport();
    const entries = parseWeeklyReport(xml, ctx.now());
    const { inserted, updated } = await upsertReports(ctx.db, entries);
    await finishRun(
      ctx.db,
      runId,
      { ok: true, eventsInserted: inserted, eventsUpdated: updated },
      ctx.now(),
    );
    ctx.log.info(
      { runId, url, entries: entries.length, inserted, updated },
      "weekly report sync complete",
    );
    return { runId, entries: entries.length, inserted, updated };
  } catch (err) {
    await finishRun(ctx.db, runId, { ok: false, error: errorMessage(err) }, ctx.now());
    throw err;
  }
}
