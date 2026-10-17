import {
  listDetailCandidates,
  markDetailChecked,
  upsertEvents,
  type CandidateOrder,
} from "../repositories/events.js";
import { deleteMechanism, upsertMechanism } from "../repositories/mechanisms.js";
import { featureToEvent, parseProducts } from "../usgs/parse.js";
import type { IngestContext } from "./context.js";

export interface DetailsOptions {
  limit?: number;
  concurrency?: number;
  /** `mag` fetches the largest events first; a backfill wants the moment tensors that matter early. */
  order?: CandidateOrder;
}

export interface DetailsResult {
  candidates: number;
  fetched: number;
  failed: number;
  mechanismsUpserted: number;
}

async function processCandidate(
  ctx: IngestContext,
  id: string,
  result: DetailsResult,
): Promise<void> {
  try {
    const detail = await ctx.usgs.fetchDetail(id);
    const event = featureToEvent(detail);
    const { mechanisms, deleted } = parseProducts(detail, ctx.log);
    await ctx.db.transaction(async (tx) => {
      await upsertEvents(tx, [event]);
      for (const m of mechanisms) await upsertMechanism(tx, m);
      for (const key of deleted) await deleteMechanism(tx, key);
      await markDetailChecked(tx, id, event.updated);
    });
    result.fetched += 1;
    result.mechanismsUpserted += mechanisms.length;
  } catch (err) {
    result.failed += 1;
    ctx.log.warn({ err, eventId: id }, "detail fetch failed; will retry next run");
  }
}

/** Fetches detail documents for events that advertise a mechanism and stores their products. */
export async function syncDetails(
  ctx: IngestContext,
  opts: DetailsOptions = {},
): Promise<DetailsResult> {
  const limit = opts.limit ?? 50;
  const concurrency = opts.concurrency ?? 2;
  const candidates = await listDetailCandidates(ctx.db, limit, opts.order ?? "time");
  const result: DetailsResult = {
    candidates: candidates.length,
    fetched: 0,
    failed: 0,
    mechanismsUpserted: 0,
  };
  // One shared iterator: each worker pulls the next candidate until the queue is drained.
  const queue = candidates.values();
  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    for (const c of queue) await processCandidate(ctx, c.id, result);
  });
  await Promise.all(workers);
  return result;
}
