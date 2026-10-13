import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type MechanismRow = typeof mechanisms.$inferSelect;
export type MechanismInsert = typeof mechanisms.$inferInsert;
