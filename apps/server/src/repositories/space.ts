import type {
  SpaceAlert,
  SpaceFlare,
  SpaceSample,
  SpaceScales,
  SpaceSeries,
} from "@tectonic/shared";
import { and, asc, desc, gte, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  spaceAlerts,
  spaceFlares,
  spaceSamples,
  spaceScales,
  type SpaceAlertRow,
  type SpaceFlareRow,
  type SpaceSampleRow,
  type SpaceScalesRow,
} from "../db/schema.js";

const CHUNK = 1000;

/** The newest value per series, null for a series never sampled. */
export type Readings = Record<SpaceSeries, SpaceSampleRow | null>;
/** Per series, `[epoch ms, value]` ascending. */
export type SeriesPoints = Record<SpaceSeries, [number, number][]>;

const emptyRecord = <T>(fill: () => T): Record<SpaceSeries, T> => ({
  kp_1m: fill(),
  kp_3h: fill(),
  dst: fill(),
  bz_gsm: fill(),
  bt: fill(),
  speed: fill(),
  density: fill(),
  xray_long: fill(),
  xray_short: fill(),
  p10: fill(),
  p100: fill(),
});

/**
 * Writes samples, replacing the value of an existing (series, time, source) row, so SWPC's
 * revisions (the 1-minute Kp estimate until its window closes) land in place. A key repeated
 * within one call keeps its last value, which Postgres would otherwise reject.
 */
export async function upsertSamples(db: Db, samples: SpaceSample[]): Promise<number> {
  const byKey = new Map<string, SpaceSample>();
  for (const s of samples) byKey.set(`${s.series}|${String(s.time.getTime())}|${s.source}`, s);
  const rows = [...byKey.values()];
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(spaceSamples)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [spaceSamples.series, spaceSamples.time, spaceSamples.source],
        set: { value: sql`excluded.value` },
      });
  }
  return rows.length;
}

/** Flares keyed by begin time; the max and end fields fill in as later files report them. */
export async function upsertFlares(db: Db, flares: SpaceFlare[]): Promise<number> {
  const byKey = new Map<number, SpaceFlare>();
  for (const f of flares) byKey.set(f.beginTime.getTime(), f);
  const rows = [...byKey.values()];
  if (rows.length === 0) return 0;
  await db
    .insert(spaceFlares)
    .values(rows)
    .onConflictDoUpdate({
      target: spaceFlares.beginTime,
      set: {
        maxTime: sql`excluded.max_time`,
        endTime: sql`excluded.end_time`,
        beginClass: sql`excluded.begin_class`,
        maxClass: sql`excluded.max_class`,
        endClass: sql`excluded.end_class`,
        maxXrlong: sql`excluded.max_xrlong`,
        satellite: sql`excluded.satellite`,
      },
    });
  return rows.length;
}

/** Alerts are immutable once issued: a repeat of (product, issue time) is ignored. Returns the number new. */
export async function insertAlerts(db: Db, alerts: SpaceAlert[]): Promise<number> {
  const byKey = new Map<string, SpaceAlert>();
  for (const a of alerts) byKey.set(`${a.productId}|${String(a.issueTime.getTime())}`, a);
  const rows = [...byKey.values()];
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(spaceAlerts)
    .values(rows)
    .onConflictDoNothing()
    .returning({ productId: spaceAlerts.productId });
  return inserted.length;
}

/** One row per (day, kind); a later issue replaces an earlier one, never the reverse. */
export async function upsertScales(db: Db, rows: SpaceScales[]): Promise<number> {
  const byKey = new Map<string, SpaceScales>();
  for (const r of rows) byKey.set(`${r.day.toISOString().slice(0, 10)}|${r.kind}`, r);
  const values = [...byKey.values()];
  if (values.length === 0) return 0;
  await db
    .insert(spaceScales)
    .values(values)
    .onConflictDoUpdate({
      target: [spaceScales.day, spaceScales.kind],
      set: {
        issued: sql`excluded.issued`,
        r: sql`excluded.r`,
        s: sql`excluded.s`,
        g: sql`excluded.g`,
        rMinorProb: sql`excluded.r_minor_prob`,
        rMajorProb: sql`excluded.r_major_prob`,
        sProb: sql`excluded.s_prob`,
        kpMax: sql`excluded.kp_max`,
      },
      setWhere: sql`excluded.issued >= ${spaceScales.issued}`,
    });
  return values.length;
}

/** The newest row of every series. */
export async function latestReadings(db: Db): Promise<Readings> {
  const rows = await db
    .selectDistinctOn([spaceSamples.series])
    .from(spaceSamples)
    .orderBy(spaceSamples.series, desc(spaceSamples.time), spaceSamples.source);
  const out = emptyRecord<SpaceSampleRow | null>(() => null);
  for (const row of rows) out[row.series] = row;
  return out;
}

/**
 * Every series between two instants: the rows themselves, or when `bucketSeconds` is set, the
 * mean per bucket (`date_bin` from the epoch 2000-01-01, grouped by ordinal so the expression
 * matches its parameter).
 */
export async function samplesBetween(
  db: Db,
  from: Date,
  to: Date,
  bucketSeconds: number | null,
): Promise<SeriesPoints> {
  const out = emptyRecord<[number, number][]>(() => []);
  const within = and(gte(spaceSamples.time, from), lte(spaceSamples.time, to));
  if (bucketSeconds === null) {
    const rows = await db
      .select({ series: spaceSamples.series, time: spaceSamples.time, value: spaceSamples.value })
      .from(spaceSamples)
      .where(within)
      .orderBy(asc(spaceSamples.series), asc(spaceSamples.time));
    for (const r of rows) out[r.series].push([r.time.getTime(), r.value]);
    return out;
  }
  // The driver hands raw sql columns back as text, so the bucket comes out as epoch milliseconds.
  const bucket = sql<number>`(extract(epoch from date_bin(${`${String(bucketSeconds)} seconds`}::interval, ${spaceSamples.time}, timestamptz '2000-01-01')) * 1000)::double precision`;
  const rows = await db
    .select({
      series: spaceSamples.series,
      ms: bucket.as("bucket_ms"),
      value: sql<number>`avg(${spaceSamples.value})::double precision`.as("mean"),
    })
    .from(spaceSamples)
    .where(within)
    .groupBy(sql`1`, sql`2`)
    .orderBy(sql`1`, sql`2`);
  for (const r of rows) out[r.series].push([r.ms, r.value]);
  return out;
}

/** Flares that overlap the window: begun inside it, or begun before and ended inside (or still open). */
export async function flaresBetween(db: Db, from: Date, to: Date): Promise<SpaceFlareRow[]> {
  return db
    .select()
    .from(spaceFlares)
    .where(
      and(
        lte(spaceFlares.beginTime, to),
        or(gte(spaceFlares.beginTime, from), gte(spaceFlares.endTime, from)),
      ),
    )
    .orderBy(asc(spaceFlares.beginTime));
}

export async function alertsBetween(db: Db, from: Date, to: Date): Promise<SpaceAlertRow[]> {
  return db
    .select()
    .from(spaceAlerts)
    .where(and(gte(spaceAlerts.issueTime, from), lte(spaceAlerts.issueTime, to)))
    .orderBy(desc(spaceAlerts.issueTime), asc(spaceAlerts.productId));
}

/** Scales rows whose day lies between two days inclusive, observed before predicted within a day. */
export async function scalesBetween(db: Db, fromDay: Date, toDay: Date): Promise<SpaceScalesRow[]> {
  return db
    .select()
    .from(spaceScales)
    .where(and(gte(spaceScales.day, fromDay), lte(spaceScales.day, toDay)))
    .orderBy(asc(spaceScales.day), asc(spaceScales.kind));
}

export async function latestFlare(db: Db): Promise<SpaceFlareRow | null> {
  const rows = await db.select().from(spaceFlares).orderBy(desc(spaceFlares.beginTime)).limit(1);
  return rows[0] ?? null;
}

export async function latestAlert(db: Db): Promise<SpaceAlertRow | null> {
  const rows = await db
    .select()
    .from(spaceAlerts)
    .orderBy(desc(spaceAlerts.issueTime), asc(spaceAlerts.productId))
    .limit(1);
  return rows[0] ?? null;
}

export interface DownsampleResult {
  /** Five-minute rows written (new or replaced). */
  thinned: number;
  /** Fine rows removed. */
  deleted: number;
}

/**
 * Replaces 1-minute rows older than `cutoff` with the mean per 5-minute bucket, written at the
 * bucket's start, then deletes the rows that are not on the 5-minute grid. Only buckets that
 * still hold an off-grid row are recomputed, so a rerun touches nothing already thinned.
 */
export async function downsampleBefore(db: Db, cutoff: Date): Promise<DownsampleResult> {
  const thinned = await db.execute(sql`
    with dirty as (
      select distinct series, source,
        date_bin('5 minutes', time, timestamptz '2000-01-01') as bucket
      from space_samples
      where time < ${cutoff} and extract(epoch from time)::bigint % 300 <> 0
    )
    insert into space_samples (series, time, source, value)
    select s.series, d.bucket, s.source, avg(s.value)
    from space_samples s
    join dirty d on d.series = s.series and d.source = s.source
      and date_bin('5 minutes', s.time, timestamptz '2000-01-01') = d.bucket
    group by 1, 2, 3
    on conflict (series, time, source) do update set value = excluded.value
  `);
  const deleted = await db.execute(sql`
    delete from space_samples
    where time < ${cutoff} and extract(epoch from time)::bigint % 300 <> 0
  `);
  return { thinned: Number(thinned.rowCount), deleted: Number(deleted.rowCount) };
}
