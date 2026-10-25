import type { RunKind, ScalesKind, SpaceSeries, VolcanoSource } from "@tectonic/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
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
    index("events_mag_time_idx").on(t.mag, t.time),
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

/** One row per completed, settled backfill window and scope: the catalogue's statement of what is loaded and frozen. */
export const catalogWindows = pgTable(
  "catalog_windows",
  {
    id: serial("id").primaryKey(),
    fromTime: timestamp("from_time", tz).notNull(),
    toTime: timestamp("to_time", tz).notNull(),
    /** Magnitude floor the window was loaded with; null = all magnitudes. */
    minMag: doublePrecision("min_mag"),
    /** `minLon,minLat,maxLon,maxLat` as the API spells it; null = global. */
    bbox: text("bbox"),
    events: integer("events").notNull(),
    pages: integer("pages").notNull(),
    runId: integer("run_id")
      .notNull()
      .references(() => ingestRuns.id),
    completedAt: timestamp("completed_at", tz).notNull(),
  },
  (t) => [
    unique("catalog_windows_key_uq").on(t.fromTime, t.toTime, t.minMag, t.bbox).nullsNotDistinct(),
    index("catalog_windows_from_idx").on(t.fromTime),
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

/** Every numeric space weather series, one row per (series, instant, source); 1-minute rows thin to 5-minute means after 30 days. */
export const spaceSamples = pgTable(
  "space_samples",
  {
    series: text("series").$type<SpaceSeries>().notNull(),
    time: timestamp("time", tz).notNull(),
    source: text("source").notNull(),
    value: real("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.series, t.time, t.source] }),
    index("space_samples_series_time_idx").on(t.series, t.time.desc()),
  ],
);

export const spaceFlares = pgTable("space_flares", {
  beginTime: timestamp("begin_time", tz).primaryKey(),
  maxTime: timestamp("max_time", tz),
  endTime: timestamp("end_time", tz),
  beginClass: text("begin_class"),
  maxClass: text("max_class"),
  endClass: text("end_class"),
  maxXrlong: doublePrecision("max_xrlong"),
  satellite: integer("satellite"),
});

export const spaceAlerts = pgTable(
  "space_alerts",
  {
    productId: text("product_id").notNull(),
    issueTime: timestamp("issue_time", tz).notNull(),
    message: text("message").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.issueTime] }),
    index("space_alerts_issue_idx").on(t.issueTime.desc()),
  ],
);

/** NOAA scales per UTC day; the latest issue of a day's row replaces the earlier one. */
export const spaceScales = pgTable(
  "space_scales",
  {
    day: date("day", { mode: "date" }).notNull(),
    kind: text("kind").$type<ScalesKind>().notNull(),
    issued: timestamp("issued", tz).notNull(),
    r: integer("r"),
    s: integer("s"),
    g: integer("g"),
    rMinorProb: integer("r_minor_prob"),
    rMajorProb: integer("r_major_prob"),
    sProb: integer("s_prob"),
    kpMax: real("kp_max"),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.kind] }),
    check("space_scales_kind_check", sql`${t.kind} in ('observed', 'predicted')`),
  ],
);

/** Postgres `bytea` as bytes; node-postgres reads and writes a Buffer. */
const bytes = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  fromDriver: (value) => value,
});

/** One OVATION Prime aurora frame: the 65 160-byte probability grid with its times and power. */
export const spaceAurora = pgTable("space_aurora", {
  observed: timestamp("observed", tz).primaryKey(),
  forecast: timestamp("forecast", tz).notNull(),
  powerNorth: real("power_north"),
  powerSouth: real("power_south"),
  grid: bytes("grid").notNull(),
});

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type MechanismRow = typeof mechanisms.$inferSelect;
export type MechanismInsert = typeof mechanisms.$inferInsert;
export type IngestRunRow = typeof ingestRuns.$inferSelect;
export type CatalogWindowRow = typeof catalogWindows.$inferSelect;
export type CatalogWindowInsert = typeof catalogWindows.$inferInsert;
export type VolcanoStatusRow = typeof volcanoStatus.$inferSelect;
export type VolcanoStatusInsert = typeof volcanoStatus.$inferInsert;
export type VolcanoReportRow = typeof volcanoReports.$inferSelect;
export type VolcanoReportInsert = typeof volcanoReports.$inferInsert;
export type SpaceSampleRow = typeof spaceSamples.$inferSelect;
export type SpaceFlareRow = typeof spaceFlares.$inferSelect;
export type SpaceAlertRow = typeof spaceAlerts.$inferSelect;
export type SpaceScalesRow = typeof spaceScales.$inferSelect;
export type SpaceAuroraRow = typeof spaceAurora.$inferSelect;
