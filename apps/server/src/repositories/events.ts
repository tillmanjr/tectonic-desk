import type {
  BBox,
  Event,
  EventWithMechanisms,
  StoredEvent,
  StoredMechanism,
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
}

export interface ListEventsFilter {
  since?: Date;
  until?: Date;
  minMag?: number;
  bbox?: BBox;
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

/**
 * Inserts new events and revises existing ones when the incoming `updated`
 * stamp is at least as new as the stored one. `last_seen` is bumped for every
 * event in the batch, revised or not.
 */
export async function upsertEvents(db: Db, batch: Event[]): Promise<UpsertResult> {
  const unique = dedupe(batch);
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0 };
  if (unique.length === 0) return result;

  await db.transaction(async (tx) => {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
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
          inArray(
            events.id,
            chunk.map((e) => e.id),
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

export async function listEvents(db: Db, filter: ListEventsFilter = {}): Promise<StoredEvent[]> {
  const requested = filter.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new RangeError(`limit must be a positive integer, got ${String(requested)}`);
  }
  const limit = Math.min(requested, MAX_LIMIT);

  const conditions: SQL[] = [];
  if (filter.since) conditions.push(gte(events.time, filter.since));
  if (filter.until) conditions.push(lte(events.time, filter.until));
  if (filter.minMag !== undefined) conditions.push(gte(events.mag, filter.minMag));
  if (filter.bbox) conditions.push(bboxCondition(filter.bbox));

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined)
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

const MECHANISM_TYPES = ["moment-tensor", "focal-mechanism"];

/** Events advertising a mechanism product whose detail has not been fetched since their last revision. */
export async function listDetailCandidates(
  db: Db,
  limit: number,
): Promise<{ id: string; updated: Date }[]> {
  return db
    .select({ id: events.id, updated: events.updated })
    .from(events)
    .where(
      and(
        arrayOverlaps(events.types, MECHANISM_TYPES),
        or(isNull(events.detailCheckedUpdated), lt(events.detailCheckedUpdated, events.updated)),
      ),
    )
    .orderBy(desc(events.time), desc(events.id))
    .limit(limit);
}

export async function markDetailChecked(db: Db, id: string, updated: Date): Promise<void> {
  await db.update(events).set({ detailCheckedUpdated: updated }).where(eq(events.id, id));
}
