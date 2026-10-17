import type { BBox } from "@tectonic/shared";
import { recordWindow, windowCovered } from "../repositories/catalog-windows.js";
import { upsertEvents, type UpsertResult } from "../repositories/events.js";
import { finishRun, startRun, updateRunDetail } from "../repositories/ingest-runs.js";
import type { QueryParams } from "../usgs/client.js";
import { parseFeedFeatures } from "../usgs/parse.js";
import type { IngestContext } from "./context.js";
import { syncDetails, type DetailsResult } from "./details.js";
import { errorMessage } from "./feed.js";
import { withRetry } from "./retry.js";
import { bboxKey, windowsBetween, type Window } from "./windows.js";

export interface BackfillOptions {
  from: Date;
  to: Date;
  /** Magnitude floor; null loads every magnitude. */
  minMagnitude: number | null;
  bbox?: BBox;
  /** Reload windows the ledger already marks complete. */
  force?: boolean;
  /** Leave detail candidates to the feeds' detail pass. */
  skipDetails?: boolean;
  pageLimit?: number;
  /** Pause after every page request. */
  pauseMs?: number;
  settleDays?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface BackfillResult {
  runId: number;
  windows: { loaded: number; skipped: number; frozen: number };
  pages: number;
  events: UpsertResult;
  details: DetailsResult;
}

const DAY_MS = 86_400_000;
/** Windows that ended more recently than this are reloaded on every run: USGS still revises them. */
export const SETTLE_DAYS = 30;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const noUpserts = (): UpsertResult => ({ inserted: 0, updated: 0, skipped: 0, merged: 0 });

export const addUpserts = (a: UpsertResult, b: UpsertResult): UpsertResult => ({
  inserted: a.inserted + b.inserted,
  updated: a.updated + b.updated,
  skipped: a.skipped + b.skipped,
  merged: a.merged + b.merged,
});

interface Settings {
  minMagnitude: number | null;
  bbox: BBox | undefined;
  pageLimit: number;
  pauseMs: number;
  sleep: (ms: number) => Promise<void>;
}

interface WindowLoad {
  pages: number;
  events: UpsertResult;
}

/** Loads one window page by page, restarting each page from the last event's time. */
async function loadWindow(ctx: IngestContext, w: Window, s: Settings): Promise<WindowLoad> {
  let cursor = w.from;
  const load: WindowLoad = { pages: 0, events: noUpserts() };
  for (;;) {
    const params: QueryParams = { starttime: cursor, endtime: w.to, limit: s.pageLimit };
    if (s.minMagnitude !== null) params.minmagnitude = s.minMagnitude;
    if (s.bbox) params.bbox = s.bbox;
    const doc = await withRetry(() => ctx.usgs.fetchQuery(params), {
      sleep: s.sleep,
      log: ctx.log,
    });
    await s.sleep(s.pauseMs);
    const parsed = parseFeedFeatures(doc, ctx.log);
    load.pages += 1;
    load.events = addUpserts(load.events, await upsertEvents(ctx.db, parsed));
    if (parsed.length < s.pageLimit) return load;
    const last = parsed[parsed.length - 1];
    if (!last || last.time.getTime() <= cursor.getTime()) {
      throw new Error(`backfill cursor cannot advance past ${cursor.toISOString()}`);
    }
    cursor = last.time;
  }
}

/** Fetches detail documents, largest events first, until a pass fetches nothing. */
async function drainDetails(ctx: IngestContext): Promise<DetailsResult> {
  const total: DetailsResult = { candidates: 0, fetched: 0, failed: 0, mechanismsUpserted: 0 };
  for (;;) {
    const r = await syncDetails(ctx, { limit: 200, order: "mag" });
    total.candidates += r.candidates;
    total.fetched += r.fetched;
    total.failed += r.failed;
    total.mechanismsUpserted += r.mechanismsUpserted;
    if (r.candidates === 0 || r.fetched === 0) return total;
  }
}

/**
 * Loads the canonical windows covering [from, to) newest first, skipping
 * windows the ledger marks complete, freezing (recording) those that ended
 * before the settle period, then drains detail candidates. Records one run.
 */
export async function backfill(ctx: IngestContext, opts: BackfillOptions): Promise<BackfillResult> {
  const s: Settings = {
    minMagnitude: opts.minMagnitude,
    bbox: opts.bbox,
    pageLimit: opts.pageLimit ?? 20_000,
    pauseMs: opts.pauseMs ?? 1_000,
    sleep: opts.sleep ?? defaultSleep,
  };
  const startedAt = ctx.now();
  const settled = startedAt.getTime() - (opts.settleDays ?? SETTLE_DAYS) * DAY_MS;
  const bbox = bboxKey(opts.bbox);
  const plan = windowsBetween(opts.from, opts.to);
  const base = {
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    minMagnitude: opts.minMagnitude,
    bbox,
    force: opts.force ?? false,
    skipDetails: opts.skipDetails ?? false,
    windows: plan.length,
  };
  const runId = await startRun(ctx.db, "backfill", base, startedAt);
  const result: BackfillResult = {
    runId,
    windows: { loaded: 0, skipped: 0, frozen: 0 },
    pages: 0,
    events: noUpserts(),
    details: { candidates: 0, fetched: 0, failed: 0, mechanismsUpserted: 0 },
  };
  try {
    for (const [i, w] of plan.entries()) {
      const key = { from: w.from, to: w.to, minMag: opts.minMagnitude, bbox };
      const label = { from: w.from.toISOString(), to: w.to.toISOString() };
      if (opts.force !== true && (await windowCovered(ctx.db, key))) {
        result.windows.skipped += 1;
        ctx.log.info({ runId, window: label }, "window already complete; skipped");
      } else {
        const load = await loadWindow(ctx, w, s);
        result.pages += load.pages;
        result.events = addUpserts(result.events, load.events);
        result.windows.loaded += 1;
        const frozen = w.to.getTime() <= settled;
        if (frozen) {
          const { inserted, updated, skipped } = load.events;
          await recordWindow(ctx.db, {
            ...key,
            events: inserted + updated + skipped,
            pages: load.pages,
            runId,
            completedAt: ctx.now(),
          });
          result.windows.frozen += 1;
        }
        ctx.log.info({ runId, window: label, ...load, frozen }, "window loaded");
      }
      await updateRunDetail(ctx.db, runId, { ...base, windowsDone: i + 1, lastWindow: label });
    }
    if (opts.skipDetails !== true) result.details = await drainDetails(ctx);
    await finishRun(
      ctx.db,
      runId,
      {
        ok: true,
        eventsInserted: result.events.inserted,
        eventsUpdated: result.events.updated,
        eventsSkipped: result.events.skipped,
        detailsFetched: result.details.fetched,
        mechanismsUpserted: result.details.mechanismsUpserted,
      },
      ctx.now(),
    );
    ctx.log.info(result, "backfill complete");
    return result;
  } catch (err) {
    await finishRun(ctx.db, runId, { ok: false, error: errorMessage(err) }, ctx.now());
    throw err;
  }
}
