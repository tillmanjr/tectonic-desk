import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { catalogWindows } from "../db/schema.js";

/** Identity of a backfill window: bounds plus the scope it was loaded with. */
export interface WindowKey {
  from: Date;
  to: Date;
  /** Magnitude floor; null = all magnitudes. */
  minMag: number | null;
  /** `minLon,minLat,maxLon,maxLat`; null = global. */
  bbox: string | null;
}

export interface WindowRecord extends WindowKey {
  events: number;
  pages: number;
  runId: number;
  completedAt: Date;
}

/** A run of contiguous completed windows with one scope. */
export interface CoverageSpan extends WindowKey {
  events: number;
  windows: number;
}

/**
 * True when a completed window has the same bounds, a floor at or below the
 * requested one (null covers everything) and a bbox that is global or equal.
 */
export async function windowCovered(db: Db, key: WindowKey): Promise<boolean> {
  const floor =
    key.minMag === null
      ? isNull(catalogWindows.minMag)
      : or(isNull(catalogWindows.minMag), lte(catalogWindows.minMag, key.minMag));
  const box =
    key.bbox === null
      ? isNull(catalogWindows.bbox)
      : or(isNull(catalogWindows.bbox), eq(catalogWindows.bbox, key.bbox));
  const rows = await db
    .select({ id: catalogWindows.id })
    .from(catalogWindows)
    .where(
      and(eq(catalogWindows.fromTime, key.from), eq(catalogWindows.toTime, key.to), floor, box),
    )
    .limit(1);
  return rows.length > 0;
}

/** Inserts or replaces the row for the window's key. */
export async function recordWindow(db: Db, rec: WindowRecord): Promise<void> {
  const counts = {
    events: rec.events,
    pages: rec.pages,
    runId: rec.runId,
    completedAt: rec.completedAt,
  };
  await db
    .insert(catalogWindows)
    .values({ fromTime: rec.from, toTime: rec.to, minMag: rec.minMag, bbox: rec.bbox, ...counts })
    .onConflictDoUpdate({
      target: [
        catalogWindows.fromTime,
        catalogWindows.toTime,
        catalogWindows.minMag,
        catalogWindows.bbox,
      ],
      set: counts,
    });
}

/** Completed windows merged into contiguous spans per scope, oldest first. */
export async function coverageSpans(db: Db): Promise<CoverageSpan[]> {
  const rows = await db
    .select()
    .from(catalogWindows)
    .orderBy(asc(catalogWindows.fromTime), asc(catalogWindows.toTime));
  const spans: CoverageSpan[] = [];
  for (const r of rows) {
    const open = spans.find(
      (s) => s.minMag === r.minMag && s.bbox === r.bbox && s.to.getTime() === r.fromTime.getTime(),
    );
    if (open) {
      open.to = r.toTime;
      open.events += r.events;
      open.windows += 1;
    } else {
      spans.push({
        from: r.fromTime,
        to: r.toTime,
        minMag: r.minMag,
        bbox: r.bbox,
        events: r.events,
        windows: 1,
      });
    }
  }
  return spans;
}
