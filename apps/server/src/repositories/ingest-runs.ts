import type { RunKind } from "@tectonic/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { ingestRuns, type IngestRunRow } from "../db/schema.js";

export type { RunKind } from "@tectonic/shared";
export const RUN_KINDS = ["feed_day", "feed_week", "backfill", "details"] as const;

export interface RunResult {
  ok: boolean;
  error?: string;
  eventsInserted?: number;
  eventsUpdated?: number;
  eventsSkipped?: number;
  detailsFetched?: number;
  mechanismsUpserted?: number;
}

export async function startRun(
  db: Db,
  kind: RunKind,
  detail: Record<string, unknown> = {},
  startedAt: Date = new Date(),
): Promise<number> {
  const rows = await db
    .insert(ingestRuns)
    .values({ kind, startedAt, detail })
    .returning({ id: ingestRuns.id });
  const first = rows[0];
  if (!first) throw new Error("insert into ingest_runs returned no row");
  return first.id;
}

export async function finishRun(
  db: Db,
  id: number,
  result: RunResult,
  finishedAt: Date = new Date(),
): Promise<void> {
  await db
    .update(ingestRuns)
    .set({
      finishedAt,
      ok: result.ok,
      error: result.error ?? null,
      eventsInserted: result.eventsInserted ?? 0,
      eventsUpdated: result.eventsUpdated ?? 0,
      eventsSkipped: result.eventsSkipped ?? 0,
      detailsFetched: result.detailsFetched ?? 0,
      mechanismsUpserted: result.mechanismsUpserted ?? 0,
    })
    .where(eq(ingestRuns.id, id));
}

export async function getRun(db: Db, id: number): Promise<IngestRunRow | null> {
  const rows = await db.select().from(ingestRuns).where(eq(ingestRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface ListRunsFilter {
  kind?: RunKind | undefined;
  limit?: number | undefined;
}

export async function listRuns(db: Db, filter: ListRunsFilter = {}): Promise<IngestRunRow[]> {
  return db
    .select()
    .from(ingestRuns)
    .where(filter.kind ? eq(ingestRuns.kind, filter.kind) : undefined)
    .orderBy(desc(ingestRuns.startedAt), desc(ingestRuns.id))
    .limit(filter.limit ?? 50);
}

/** The most recently started run of each kind; null for a kind that never ran. */
export async function latestRuns(db: Db): Promise<Record<RunKind, IngestRunRow | null>> {
  const rows = await db
    .selectDistinctOn([ingestRuns.kind])
    .from(ingestRuns)
    .orderBy(ingestRuns.kind, desc(ingestRuns.startedAt), desc(ingestRuns.id));
  const out: Record<RunKind, IngestRunRow | null> = {
    feed_day: null,
    feed_week: null,
    backfill: null,
    details: null,
  };
  for (const row of rows) out[row.kind] = row;
  return out;
}

/** Latest finish time of a successful feed_day or feed_week run; null if none. */
export async function lastSuccessfulFeedAt(db: Db): Promise<Date | null> {
  const rows = await db
    .select({ finishedAt: ingestRuns.finishedAt })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.ok, true), inArray(ingestRuns.kind, ["feed_day", "feed_week"])))
    .orderBy(desc(ingestRuns.finishedAt))
    .limit(1);
  return rows[0]?.finishedAt ?? null;
}
