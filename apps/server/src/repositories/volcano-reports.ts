import type { VolcanoReport } from "@tectonic/shared";
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { volcanoReports, type VolcanoReportRow } from "../db/schema.js";

export interface ReportUpsertResult {
  inserted: number;
  updated: number;
}

/** Inserts entries, refreshing title, body and category of ones already held for that volcano and week. */
export async function upsertReports(db: Db, reports: VolcanoReport[]): Promise<ReportUpsertResult> {
  const result: ReportUpsertResult = { inserted: 0, updated: 0 };
  if (reports.length === 0) return result;
  const rows = await db
    .insert(volcanoReports)
    .values(reports)
    .onConflictDoUpdate({
      target: [volcanoReports.number, volcanoReports.week],
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        title: sql`excluded.title`,
        body: sql`excluded.body`,
        url: sql`excluded.url`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  for (const r of rows) {
    if (r.inserted) result.inserted += 1;
    else result.updated += 1;
  }
  return result;
}

/** Entries of the latest `weeks` report weeks, newest week first, new activity before ongoing. */
export async function listReports(db: Db, weeks: number): Promise<VolcanoReportRow[]> {
  const recent = await db
    .selectDistinct({ week: volcanoReports.week })
    .from(volcanoReports)
    .orderBy(desc(volcanoReports.week))
    .limit(weeks);
  if (recent.length === 0) return [];
  return db
    .select()
    .from(volcanoReports)
    .where(
      inArray(
        volcanoReports.week,
        recent.map((r) => r.week),
      ),
    )
    .orderBy(desc(volcanoReports.week), volcanoReports.category, volcanoReports.name);
}

/** Every entry for one GVP number, newest first. */
export async function reportsFor(db: Db, number: number): Promise<VolcanoReportRow[]> {
  return db
    .select()
    .from(volcanoReports)
    .where(eq(volcanoReports.number, number))
    .orderBy(desc(volcanoReports.week));
}
