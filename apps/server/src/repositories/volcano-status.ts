import type { VolcanoStatus } from "@tectonic/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { volcanoStatus, type VolcanoStatusRow } from "../db/schema.js";

/** The newest row per (source, key): the current state of every monitored volcano. */
export async function latestStatuses(db: Db): Promise<VolcanoStatusRow[]> {
  return db
    .selectDistinctOn([volcanoStatus.source, volcanoStatus.key])
    .from(volcanoStatus)
    .orderBy(
      volcanoStatus.source,
      volcanoStatus.key,
      desc(volcanoStatus.observedAt),
      desc(volcanoStatus.id),
    );
}

const stamp = (d: Date | null): number | null => (d === null ? null : d.getTime());

const same = (prev: VolcanoStatusRow, next: VolcanoStatus): boolean =>
  prev.level === next.level &&
  prev.color === next.color &&
  stamp(prev.noticeAt) === stamp(next.noticeAt);

/** Inserts one row per volcano whose level, colour or notice time differs from its latest row. */
export async function recordStatuses(
  db: Db,
  statuses: VolcanoStatus[],
): Promise<{ inserted: number }> {
  const latest = new Map<string, VolcanoStatusRow>();
  for (const row of await latestStatuses(db)) latest.set(`${row.source}:${row.key}`, row);
  const changed = statuses.filter((s) => {
    const prev = latest.get(`${s.source}:${s.key}`);
    return prev === undefined || !same(prev, s);
  });
  if (changed.length > 0) await db.insert(volcanoStatus).values(changed);
  return { inserted: changed.length };
}

/**
 * Rows observed at or after `since` that follow an earlier row for the same
 * volcano, newest first: the first observation of a volcano is a baseline,
 * not a change.
 */
export async function statusChanges(db: Db, since: Date): Promise<VolcanoStatusRow[]> {
  return db
    .select()
    .from(volcanoStatus)
    .where(
      and(
        gte(volcanoStatus.observedAt, since),
        sql`exists (select 1 from ${volcanoStatus} p where p.source = ${volcanoStatus.source} and p.key = ${volcanoStatus.key} and p.observed_at < ${volcanoStatus.observedAt})`,
      ),
    )
    .orderBy(desc(volcanoStatus.observedAt), desc(volcanoStatus.id));
}

/** Every row for one GVP number, newest first. */
export async function statusHistory(db: Db, number: number): Promise<VolcanoStatusRow[]> {
  return db
    .select()
    .from(volcanoStatus)
    .where(eq(volcanoStatus.number, number))
    .orderBy(desc(volcanoStatus.observedAt), desc(volcanoStatus.id));
}
