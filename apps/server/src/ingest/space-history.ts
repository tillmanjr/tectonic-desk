import { seriesRecord, type SpaceSeries } from "@tectonic/shared";
import { deleteSupersededKp, upsertSamples } from "../repositories/space.js";
import { GFZ_SERIES, parseGfz, parseKyotoDst } from "../space/history-parse.js";
import { GFZ_INDEXES, type GfzIndex } from "../space/history-schema.js";
import { withRetry } from "./retry.js";
import { sleep } from "./sleep.js";
import { runParts, type SpaceContext, type SpaceRunResult } from "./space.js";

/**
 * The long record: GFZ's Kp, Ap, sunspot number and F10.7 and Kyoto's hourly Dst. A daily job
 * rewrites the last two months, which is when GFZ turns preliminary Kp definitive and Kyoto
 * turns real-time Dst provisional; a one-off backfill walks the archives in ten-year chunks.
 */

/** The daily job rewrites this many days back from now. */
export const HISTORY_REFRESH_DAYS = 60;
export const HISTORY_CHUNK_YEARS = 10;
/** The first GFZ Kp value. */
export const HISTORY_START = new Date("1932-01-01T00:00:00Z");
const DAY_MS = 86_400_000;

interface GfzWrite {
  written: number;
  superseded: number;
}

async function writeGfz(
  ctx: SpaceContext,
  index: GfzIndex,
  from: Date,
  to: Date,
): Promise<GfzWrite> {
  const written = await upsertSamples(
    ctx.db,
    parseGfz(await ctx.history.fetchGfz(index, from, to)),
  );
  const superseded = index === "Kp" ? await deleteSupersededKp(ctx.db) : 0;
  return { written, superseded };
}

const writeDst = async (ctx: SpaceContext, from: Date, to: Date): Promise<number> =>
  upsertSamples(ctx.db, parseKyotoDst(await ctx.history.fetchDst(from, to)));

/** The daily job: every history source over the last `HISTORY_REFRESH_DAYS`. */
export function syncSpaceHistory(ctx: SpaceContext): Promise<SpaceRunResult> {
  const to = ctx.now();
  const from = new Date(to.getTime() - HISTORY_REFRESH_DAYS * DAY_MS);
  return runParts(ctx, "space_history", [
    ...GFZ_INDEXES.map((index) => ({
      name: `gfz_${index}`,
      run: async () => (await writeGfz(ctx, index, from, to)).written,
    })),
    { name: "dst", run: () => writeDst(ctx, from, to) },
  ]);
}

export interface HistoryChunk {
  from: Date;
  to: Date;
}

/**
 * Ten calendar years at a time, newest first: the first chunk ends at `to` and starts on 1 January
 * nine years before `to`'s year; each next one ends a second before the previous began; the
 * last starts at `from`.
 */
export function historyChunks(from: Date, to: Date): HistoryChunk[] {
  const chunks: HistoryChunk[] = [];
  let end = to;
  while (end.getTime() > from.getTime()) {
    const startOfSpan = Date.UTC(end.getUTCFullYear() - HISTORY_CHUNK_YEARS + 1, 0, 1);
    const start = new Date(Math.max(startOfSpan, from.getTime()));
    chunks.push({ from: start, to: end });
    end = new Date(start.getTime() - 1000);
  }
  return chunks;
}

export interface HistoryBackfillOptions {
  from: Date;
  to: Date;
  /** Injectable pause for the retries; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

export interface HistoryBackfillResult {
  /** Rows written per series over every chunk. */
  written: Record<SpaceSeries, number>;
  /** Preliminary Kp rows a definitive row replaced. */
  superseded: number;
  chunks: number;
}

/** Loads the archives between two instants, chunk by chunk, retrying each request. */
export async function backfillSpaceHistory(
  ctx: SpaceContext,
  opts: HistoryBackfillOptions,
): Promise<HistoryBackfillResult> {
  const retry = { sleep: opts.sleep ?? sleep, log: ctx.log };
  const written = seriesRecord(() => 0);
  let superseded = 0;
  const chunks = historyChunks(opts.from, opts.to);
  for (const chunk of chunks) {
    for (const index of GFZ_INDEXES) {
      const r = await withRetry(() => writeGfz(ctx, index, chunk.from, chunk.to), retry);
      written[GFZ_SERIES[index]] += r.written;
      superseded += r.superseded;
    }
    written.dst += await withRetry(() => writeDst(ctx, chunk.from, chunk.to), retry);
    ctx.log.info({ chunk, written }, "space history chunk loaded");
  }
  return { written, superseded, chunks: chunks.length };
}
