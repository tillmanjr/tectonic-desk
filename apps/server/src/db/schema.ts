import type { RunKind, VolcanoSource } from "@tectonic/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true, mode: "date" } as const;

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    time: timestamp("time", tz).notNull(),
    updated: timestamp("updated", tz).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    depthKm: doublePrecision("depth_km"),
    mag: doublePrecision("mag"),
    magType: text("mag_type"),
    place: text("place"),
    net: text("net"),
    status: text("status"),
    alert: text("alert"),
    sig: integer("sig"),
    felt: integer("felt"),
    cdi: doublePrecision("cdi"),
    mmi: doublePrecision("mmi"),
    tsunami: boolean("tsunami").notNull().default(false),
    eventType: text("event_type"),
    types: text("types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    detailCheckedUpdated: timestamp("detail_checked_updated", tz),
    firstSeen: timestamp("first_seen", tz).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", tz).notNull().defaultNow(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    index("events_time_idx").on(t.time),
    index("events_lat_lon_idx").on(t.latitude, t.longitude),
    index("events_mag_idx").on(t.mag),
  ],
);

export const mechanisms = pgTable(
  "mechanisms",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"mt" | "fm">().notNull(),
    source: text("source").notNull(),
    code: text("code").notNull(),
    preferred: boolean("preferred").notNull().default(false),
    strike1: doublePrecision("strike1"),
    dip1: doublePrecision("dip1"),
    rake1: doublePrecision("rake1"),
    strike2: doublePrecision("strike2"),
    dip2: doublePrecision("dip2"),
    rake2: doublePrecision("rake2"),
    tAzimuth: doublePrecision("t_azimuth"),
    tPlunge: doublePrecision("t_plunge"),
    pAzimuth: doublePrecision("p_azimuth"),
    pPlunge: doublePrecision("p_plunge"),
    nAzimuth: doublePrecision("n_azimuth"),
    nPlunge: doublePrecision("n_plunge"),
    mrr: doublePrecision("mrr"),
    mtt: doublePrecision("mtt"),
    mpp: doublePrecision("mpp"),
    mrt: doublePrecision("mrt"),
    mrp: doublePrecision("mrp"),
    mtp: doublePrecision("mtp"),
    scalarMoment: doublePrecision("scalar_moment"),
    mw: doublePrecision("mw"),
    depthKm: doublePrecision("depth_km"),
    percentDc: doublePrecision("percent_dc"),
    planesReconstructed: boolean("planes_reconstructed").notNull().default(false),
    productUpdated: timestamp("product_updated", tz),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    uniqueIndex("mechanisms_event_kind_source_code_uq").on(t.eventId, t.kind, t.source, t.code),
    index("mechanisms_event_id_idx").on(t.eventId),
    check("mechanisms_kind_check", sql`${t.kind} in ('mt', 'fm')`),
  ],
);

export const eventsRelations = relations(events, ({ many }) => ({
  mechanisms: many(mechanisms),
}));

export const mechanismsRelations = relations(mechanisms, ({ one }) => ({
  event: one(events, { fields: [mechanisms.eventId], references: [events.id] }),
}));

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<RunKind>().notNull(),
    startedAt: timestamp("started_at", tz).notNull(),
    finishedAt: timestamp("finished_at", tz),
    ok: boolean("ok"),
    eventsInserted: integer("events_inserted").notNull().default(0),
    eventsUpdated: integer("events_updated").notNull().default(0),
    eventsSkipped: integer("events_skipped").notNull().default(0),
    detailsFetched: integer("details_fetched").notNull().default(0),
    mechanismsUpserted: integer("mechanisms_upserted").notNull().default(0),
    error: text("error"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("ingest_runs_kind_started_idx").on(t.kind, t.startedAt.desc()),
    check(
      "ingest_runs_kind_check",
      sql`${t.kind} in ('feed_day', 'feed_week', 'backfill', 'details', 'volcano_status', 'volcano_reports')`,
    ),
  ],
);

export const volcanoStatus = pgTable(
  "volcano_status",
  {
    id: serial("id").primaryKey(),
    source: text("source").$type<VolcanoSource>().notNull(),
    key: text("key").notNull(),
    number: integer("number"),
    name: text("name").notNull(),
    level: text("level").notNull(),
    color: text("color"),
    noticeAt: timestamp("notice_at", tz),
    synopsis: text("synopsis"),
    url: text("url"),
    observedAt: timestamp("observed_at", tz).notNull(),
  },
  (t) => [
    index("volcano_status_source_key_observed_idx").on(t.source, t.key, t.observedAt.desc()),
    index("volcano_status_number_idx").on(t.number),
    index("volcano_status_observed_idx").on(t.observedAt.desc()),
    check("volcano_status_source_check", sql`${t.source} in ('usgs', 'geonet')`),
  ],
);

export const volcanoReports = pgTable(
  "volcano_reports",
  {
    id: serial("id").primaryKey(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    week: date("week", { mode: "date" }).notNull(),
    category: text("category").$type<"new" | "ongoing">().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    fetchedAt: timestamp("fetched_at", tz).notNull(),
  },
  (t) => [
    uniqueIndex("volcano_reports_number_week_uq").on(t.number, t.week),
    index("volcano_reports_week_idx").on(t.week.desc()),
    check("volcano_reports_category_check", sql`${t.category} in ('new', 'ongoing')`),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type MechanismRow = typeof mechanisms.$inferSelect;
export type MechanismInsert = typeof mechanisms.$inferInsert;
export type IngestRunRow = typeof ingestRuns.$inferSelect;
export type VolcanoStatusRow = typeof volcanoStatus.$inferSelect;
export type VolcanoStatusInsert = typeof volcanoStatus.$inferInsert;
export type VolcanoReportRow = typeof volcanoReports.$inferSelect;
export type VolcanoReportInsert = typeof volcanoReports.$inferInsert;
