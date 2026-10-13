import { upsertEvents, type UpsertResult } from "../repositories/events.js";
import { finishRun, startRun } from "../repositories/ingest-runs.js";
import type { FeedKind } from "../usgs/client.js";
import { parseFeedFeatures } from "../usgs/parse.js";
import type { IngestContext } from "./context.js";
import { syncDetails, type DetailsResult } from "./details.js";

export type FeedName = "day" | "week";

const FEEDS: Record<FeedName, { kind: FeedKind; run: "feed_day" | "feed_week" }> = {
  day: { kind: "2.5_day", run: "feed_day" },
  week: { kind: "2.5_week", run: "feed_week" },
};

export interface FeedRunResult {
  runId: number;
  events: UpsertResult;
  details: DetailsResult;
}

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** Loads one summary feed, then fetches details for new candidates, recording the run. */
export async function syncFeed(ctx: IngestContext, name: FeedName): Promise<FeedRunResult> {
  const { kind, run } = FEEDS[name];
  const runId = await startRun(ctx.db, run, { feed: kind }, ctx.now());
  try {
    const doc = await ctx.usgs.fetchFeed(kind);
    const parsed = parseFeedFeatures(doc, ctx.log);
    const events = await upsertEvents(ctx.db, parsed);
    const details = await syncDetails(ctx);
    await finishRun(
      ctx.db,
      runId,
      {
        ok: true,
        eventsInserted: events.inserted,
        eventsUpdated: events.updated,
        eventsSkipped: events.skipped,
        detailsFetched: details.fetched,
        mechanismsUpserted: details.mechanismsUpserted,
      },
      ctx.now(),
    );
    ctx.log.info({ runId, feed: kind, events, details }, "feed sync complete");
    return { runId, events, details };
  } catch (err) {
    await finishRun(ctx.db, runId, { ok: false, error: errorMessage(err) }, ctx.now());
    throw err;
  }
}
