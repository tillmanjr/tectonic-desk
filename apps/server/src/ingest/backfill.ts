import { upsertEvents, type UpsertResult } from "../repositories/events.js";
import { finishRun, startRun } from "../repositories/ingest-runs.js";
import { parseFeedFeatures } from "../usgs/parse.js";
import type { IngestContext } from "./context.js";
import { syncDetails, type DetailsResult } from "./details.js";
import { errorMessage } from "./feed.js";

export interface BackfillOptions {
  days: number;
  windowDays?: number;
  minMagnitude?: number;
  pageLimit?: number;
}

export interface BackfillResult {
  runId: number;
  pages: number;
  events: UpsertResult;
  details: DetailsResult;
}

const DAY_MS = 86_400_000;

const add = (a: UpsertResult, b: UpsertResult): UpsertResult => ({
  inserted: a.inserted + b.inserted,
  updated: a.updated + b.updated,
  skipped: a.skipped + b.skipped,
});

/** Loads one time window page by page, restarting each page from the last event's time. */
async function loadWindow(
  ctx: IngestContext,
  start: Date,
  end: Date,
  minmagnitude: number,
  limit: number,
  totals: { pages: number; events: UpsertResult },
): Promise<void> {
  let cursor = start;
  for (;;) {
    const doc = await ctx.usgs.fetchQuery({ starttime: cursor, endtime: end, minmagnitude, limit });
    const events = parseFeedFeatures(doc, ctx.log);
    totals.pages += 1;
    totals.events = add(totals.events, await upsertEvents(ctx.db, events));
    if (events.length < limit) return;
    const last = events[events.length - 1];
    if (!last || last.time.getTime() <= cursor.getTime()) {
      throw new Error(`backfill cursor cannot advance past ${cursor.toISOString()}`);
    }
    cursor = last.time;
  }
}

/** Loads `days` of history in windows, then drains detail candidates. Records one run. */
export async function backfill(ctx: IngestContext, opts: BackfillOptions): Promise<BackfillResult> {
  const windowDays = opts.windowDays ?? 30;
  const minMagnitude = opts.minMagnitude ?? 2.5;
  const pageLimit = opts.pageLimit ?? 20_000;
  const end = ctx.now();
  const start = new Date(end.getTime() - opts.days * DAY_MS);
  const runId = await startRun(
    ctx.db,
    "backfill",
    {
      days: opts.days,
      windowDays,
      minMagnitude,
      pageLimit,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    end,
  );
  try {
    const totals = { pages: 0, events: { inserted: 0, updated: 0, skipped: 0 } };
    for (let ws = start; ws < end; ws = new Date(ws.getTime() + windowDays * DAY_MS)) {
      const we = new Date(Math.min(ws.getTime() + windowDays * DAY_MS, end.getTime()));
      await loadWindow(ctx, ws, we, minMagnitude, pageLimit, totals);
    }
    const details: DetailsResult = { candidates: 0, fetched: 0, failed: 0, mechanismsUpserted: 0 };
    for (;;) {
      const r = await syncDetails(ctx, { limit: 200 });
      details.candidates += r.candidates;
      details.fetched += r.fetched;
      details.failed += r.failed;
      details.mechanismsUpserted += r.mechanismsUpserted;
      if (r.candidates === 0 || r.fetched === 0) break;
    }
    await finishRun(
      ctx.db,
      runId,
      {
        ok: true,
        eventsInserted: totals.events.inserted,
        eventsUpdated: totals.events.updated,
        eventsSkipped: totals.events.skipped,
        detailsFetched: details.fetched,
        mechanismsUpserted: details.mechanismsUpserted,
      },
      ctx.now(),
    );
    ctx.log.info(
      { runId, pages: totals.pages, events: totals.events, details },
      "backfill complete",
    );
    return { runId, pages: totals.pages, events: totals.events, details };
  } catch (err) {
    await finishRun(ctx.db, runId, { ok: false, error: errorMessage(err) }, ctx.now());
    throw err;
  }
}
