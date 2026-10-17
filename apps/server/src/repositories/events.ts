import type {
  BBox,
  Event,
  EventWithMechanisms,
  StoredEvent,
  StoredMechanism,
  SummaryBy,
} from "@tectonic/shared";
import {
  and,
  arrayOverlaps,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  max,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "../db/client.js";
import { events, mechanisms } from "../db/schema.js";
import { eventToRow, rowToEvent } from "../mappers/events.js";
import { rowToMechanism } from "../mappers/mechanisms.js";
import { listPreferredMechanisms } from "./mechanisms.js";

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
  /** Stored rows deleted because an incoming event listed their id among its aliases. */
  merged: number;
}

/** The where-clause part of a list request, shared by the list and the aggregates. */
export interface EventsWhere {
  since?: Date;
  until?: Date;
  minMag?: number;
  bbox?: BBox;
}

export interface ListEventsFilter extends EventsWhere {
  limit?: number;
}

export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 5000;
const CHUNK = 500;

const excluded = (column: string): SQL => sql.raw(`excluded."${column}"`);

const updateSet = {
  time: excluded("time"),
  updated: excluded("updated"),
  latitude: excluded("latitude"),
  longitude: excluded("longitude"),
  depthKm: excluded("depth_km"),
  mag: excluded("mag"),
  magType: excluded("mag_type"),
  place: excluded("place"),
  net: excluded("net"),
  status: excluded("status"),
  alert: excluded("alert"),
  sig: excluded("sig"),
  felt: excluded("felt"),
  cdi: excluded("cdi"),
  mmi: excluded("mmi"),
  tsunami: excluded("tsunami"),
  eventType: excluded("event_type"),
  types: excluded("types"),
  raw: excluded("raw"),
};

/** Keeps one entry per id, the one with the latest `updated`. */
function dedupe(batch: Event[]): Event[] {
  const byId = new Map<string, Event>();
  for (const e of batch) {
    const prev = byId.get(e.id);
    if (!prev || e.updated.getTime() >= prev.updated.getTime()) byId.set(e.id, e);
  }
  return [...byId.values()];
}

/** Other ComCat ids an event has carried, from the comma-wrapped `ids` feed property. */
function aliasesOf(e: Event): string[] {
  const ids = e.raw.ids;
  if (typeof ids !== "string") return [];
  return ids.split(",").filter((s) => s.length > 0 && s !== e.id);
}

/**
 * Inserts new events and revises existing ones when the incoming `updated`
 * stamp is at least as new as the stored one. Rows whose id an incoming event
 * lists as an alias are deleted first (ComCat re-keys events between networks).
 * `last_seen` is bumped at most once an hour per row, so a quiet catalogue is
 * not rewritten by every feed poll.
 */
export async function upsertEvents(db: Db, batch: Event[]): Promise<UpsertResult> {
  const unique = dedupe(batch);
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, merged: 0 };
  if (unique.length === 0) return result;
  const batchIds = new Set(unique.map((e) => e.id));

  await db.transaction(async (tx) => {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const aliases = [...new Set(chunk.flatMap(aliasesOf))].filter((id) => !batchIds.has(id));
      if (aliases.length > 0) {
        const gone = await tx
          .delete(events)
          .where(inArray(events.id, aliases))
          .returning({ id: events.id });
        result.merged += gone.length;
      }
      const touched = await tx
        .insert(events)
        .values(chunk.map(eventToRow))
        .onConflictDoUpdate({
          target: events.id,
          set: updateSet,
          setWhere: sql`excluded.updated >= ${events.updated}`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const row of touched) {
        if (row.inserted) result.inserted += 1;
        else result.updated += 1;
      }
      result.skipped += chunk.length - touched.length;
      await tx
        .update(events)
        .set({ lastSeen: sql`now()` })
        .where(
          and(
            inArray(
              events.id,
              chunk.map((e) => e.id),
            ),
            sql`${events.lastSeen} < now() - interval '1 hour'`,
          ),
        );
    }
  });
  return result;
}

/** Longitude wraps when minLon > maxLon, so the box crosses the antimeridian. */
function bboxCondition(b: BBox): SQL {
  const lat = sql`${events.latitude} between ${b.minLat} and ${b.maxLat}`;
  const lon =
    b.minLon <= b.maxLon
      ? sql`${events.longitude} between ${b.minLon} and ${b.maxLon}`
      : sql`(${events.longitude} >= ${b.minLon} or ${events.longitude} <= ${b.maxLon})`;
  return sql`(${lat} and ${lon})`;
}

function whereOf(filter: EventsWhere): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.since) conditions.push(gte(events.time, filter.since));
  if (filter.until) conditions.push(lte(events.time, filter.until));
  if (filter.minMag !== undefined) conditions.push(gte(events.mag, filter.minMag));
  if (filter.bbox) conditions.push(bboxCondition(filter.bbox));
  return conditions.length ? and(...conditions) : undefined;
}

export async function listEvents(db: Db, filter: ListEventsFilter = {}): Promise<StoredEvent[]> {
  const requested = filter.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new RangeError(`limit must be a positive integer, got ${String(requested)}`);
  }
  const limit = Math.min(requested, MAX_LIMIT);

  const rows = await db
    .select()
    .from(events)
    .where(whereOf(filter))
    .orderBy(desc(events.time), desc(events.id))
    .limit(limit);
  return rows.map(rowToEvent);
}

/** `listEvents` plus each event's preferred mechanisms, fetched in one query. */
export async function listEventsWithPreferred(
  db: Db,
  filter: ListEventsFilter = {},
): Promise<EventWithMechanisms[]> {
  const list = await listEvents(db, filter);
  const byEvent = new Map<string, StoredMechanism[]>();
  for (const m of await listPreferredMechanisms(
    db,
    list.map((e) => e.id),
  )) {
    const bucket = byEvent.get(m.eventId);
    if (bucket) bucket.push(m);
    else byEvent.set(m.eventId, [m]);
  }
  return list.map((e) => ({ ...e, mechanisms: byEvent.get(e.id) ?? [] }));
}

export async function getEvent(db: Db, id: string): Promise<EventWithMechanisms | null> {
  const row = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: {
      mechanisms: {
        orderBy: (m, o) => [o.asc(m.kind), o.desc(m.preferred), o.asc(m.source), o.asc(m.code)],
      },
    },
  });
  if (!row) return null;
  return { ...rowToEvent(row), mechanisms: row.mechanisms.map(rowToMechanism) };
}

export interface CatalogStats {
  events: { total: number; newest: Date | null; oldest: Date | null; withMechanism: number };
  mechanisms: { total: number };
}

/** The first row of an aggregate query, which Postgres always returns. */
function single<T>(rows: T[]): T {
  const first = rows[0];
  if (first === undefined) throw new Error("aggregate query returned no row");
  return first;
}

export async function catalogStats(db: Db): Promise<CatalogStats> {
  const eventCount = single(await db.select({ total: count() }).from(events));
  const [newest] = await db
    .select({ time: events.time })
    .from(events)
    .orderBy(desc(events.time))
    .limit(1);
  const [oldest] = await db
    .select({ time: events.time })
    .from(events)
    .orderBy(asc(events.time))
    .limit(1);
  const mechCount = single(
    await db
      .select({ total: count(), withMechanism: countDistinct(mechanisms.eventId) })
      .from(mechanisms),
  );
  return {
    events: {
      total: eventCount.total,
      newest: newest?.time ?? null,
      oldest: oldest?.time ?? null,
      withMechanism: mechCount.withMechanism,
    },
    mechanisms: { total: mechCount.total },
  };
}

export async function countEvents(db: Db, filter: EventsWhere): Promise<number> {
  return single(await db.select({ total: count() }).from(events).where(whereOf(filter))).total;
}

export interface MagBands {
  lt4: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
}

export interface SummaryBin {
  start: Date;
  count: number;
  maxMag: number | null;
  mags: MagBands;
}

const bandCount = (where: SQL): SQL<number> =>
  sql<number>`count(*) filter (where ${where})`.mapWith(Number);

const bands = {
  lt4: bandCount(sql`${events.mag} < 4`),
  m4: bandCount(sql`${events.mag} >= 4 and ${events.mag} < 5`),
  m5: bandCount(sql`${events.mag} >= 5 and ${events.mag} < 6`),
  m6: bandCount(sql`${events.mag} >= 6 and ${events.mag} < 7`),
  m7: bandCount(sql`${events.mag} >= 7`),
};

const toDate = (v: string | Date): Date => new Date(v);

/** Non-empty UTC bins of `by` with counts, the largest magnitude and magnitude-class counts. */
export async function summarizeEvents(
  db: Db,
  filter: EventsWhere,
  by: SummaryBy,
): Promise<SummaryBin[]> {
  // `by` is one of three literals; inlining it keeps the expression free of parameters.
  const start = sql<Date>`date_trunc(${sql.raw(`'${by}'`)}, ${events.time}, 'UTC')`.mapWith(toDate);
  const rows = await db
    .select({ start, count: count(), maxMag: max(events.mag), ...bands })
    .from(events)
    .where(whereOf(filter))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({
    start: r.start,
    count: r.count,
    maxMag: r.maxMag,
    mags: { lt4: r.lt4, m4: r.m4, m5: r.m5, m6: r.m6, m7: r.m7 },
  }));
}

export interface GridCell {
  lat: number;
  lon: number;
  count: number;
  maxMag: number | null;
}

/** Event counts per `cell`-degree square, keyed by the square's south-west corner. */
export async function gridEvents(db: Db, filter: EventsWhere, cell: number): Promise<GridCell[]> {
  // Grouping by ordinal keeps the parameterised cell expressions identical in SELECT and GROUP BY.
  const lat = sql<number>`floor(${events.latitude} / ${cell}) * ${cell}`.mapWith(Number);
  const lon = sql<number>`floor(${events.longitude} / ${cell}) * ${cell}`.mapWith(Number);
  return db
    .select({ lat, lon, count: count(), maxMag: max(events.mag) })
    .from(events)
    .where(whereOf(filter))
    .groupBy(sql`1, 2`)
    .orderBy(sql`1, 2`);
}

const MECHANISM_TYPES = ["moment-tensor", "focal-mechanism"];

export type CandidateOrder = "time" | "mag";

/**
 * Events advertising a mechanism product whose detail has not been fetched
 * since their last revision; newest first, or largest first for a backfill.
 */
export async function listDetailCandidates(
  db: Db,
  limit: number,
  order: CandidateOrder = "time",
): Promise<{ id: string; updated: Date }[]> {
  const byTime = [desc(events.time), desc(events.id)];
  return db
    .select({ id: events.id, updated: events.updated })
    .from(events)
    .where(
      and(
        arrayOverlaps(events.types, MECHANISM_TYPES),
        or(isNull(events.detailCheckedUpdated), lt(events.detailCheckedUpdated, events.updated)),
      ),
    )
    .orderBy(...(order === "mag" ? [sql`${events.mag} desc nulls last`, ...byTime] : byTime))
    .limit(limit);
}

export async function markDetailChecked(db: Db, id: string, updated: Date): Promise<void> {
  await db.update(events).set({ detailCheckedUpdated: updated }).where(eq(events.id, id));
}
