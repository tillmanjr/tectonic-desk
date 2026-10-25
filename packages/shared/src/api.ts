import type {
  BBox,
  StoredEvent,
  StoredMechanism,
  StoredVolcanoReport,
  StoredVolcanoStatus,
} from "./index.js";

/** The wire form of a domain object: Date becomes an ISO 8601 UTC string. */
export type Json<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type ApiMechanism = Omit<Json<StoredMechanism>, "raw">;

/** A listed event. `mechanisms` holds the preferred product per kind. */
export interface ApiEvent extends Omit<
  Json<StoredEvent>,
  "raw" | "firstSeen" | "lastSeen" | "detailCheckedUpdated"
> {
  mechanisms: ApiMechanism[];
}

/** One event with every mechanism product and the raw USGS feed properties. */
export interface ApiEventDetail extends Omit<Json<StoredEvent>, "raw"> {
  mechanisms: ApiMechanism[];
  usgs: Record<string, unknown>;
}

/** The filters applied to a request, after defaults. */
export interface ApiEventFilter {
  since: string;
  until: string | null;
  minMag: number | null;
  bbox: BBox | null;
}

export interface ApiEventQuery extends ApiEventFilter {
  limit: number;
}

export interface ApiEventCount {
  count: number;
  query: ApiEventFilter;
}

export type SummaryBy = "day" | "month" | "year";

/** Counts by magnitude class; events without a magnitude are in the bin's `count` only. */
export interface ApiMagBands {
  lt4: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
}

export interface ApiSummaryBin {
  /** Start of the bin (UTC day, month or year). Empty bins are omitted. */
  start: string;
  count: number;
  maxMag: number | null;
  mags: ApiMagBands;
}

export interface ApiEventSummary {
  by: SummaryBy;
  bins: ApiSummaryBin[];
  query: ApiEventFilter;
}

/** One grid cell, keyed by its south-west corner in degrees. */
export interface ApiGridCell {
  lat: number;
  lon: number;
  count: number;
  maxMag: number | null;
}

export interface ApiEventGrid {
  cell: number;
  cells: ApiGridCell[];
  query: ApiEventFilter;
}

/** A contiguous span of backfill windows that are complete and frozen. */
export interface ApiCoverageSpan {
  from: string;
  to: string;
  minMag: number | null;
  bbox: string | null;
  events: number;
  windows: number;
}

export interface ApiCoverage {
  spans: ApiCoverageSpan[];
}

export interface ApiEventList {
  events: ApiEvent[];
  count: number;
  /** True when the result filled `limit`; narrow the window or raise the limit. */
  truncated: boolean;
  query: ApiEventQuery;
}

export type RegionId = "global" | "wc";

export interface ApiRegion {
  id: RegionId;
  name: string;
  subtitle: string;
  minMag: number;
  days: number;
  bbox: BBox | null;
}

export type RunKind =
  "feed_day" | "feed_week" | "backfill" | "details" | "volcano_status" | "volcano_reports";

export interface ApiRun {
  id: number;
  kind: RunKind;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  eventsInserted: number;
  eventsUpdated: number;
  eventsSkipped: number;
  detailsFetched: number;
  mechanismsUpserted: number;
  error: string | null;
  detail: Record<string, unknown>;
}

export interface ApiStatus {
  generatedAt: string;
  events: {
    total: number;
    newest: string | null;
    oldest: string | null;
    /** Events with at least one mechanism row. */
    withMechanism: number;
  };
  mechanisms: { total: number };
  runs: Record<RunKind, ApiRun | null>;
  /** Latest finished_at of a successful feed_day or feed_week run. */
  lastSuccessfulFeed: string | null;
}

export type ApiVolcanoStatus = Json<StoredVolcanoStatus>;
export type ApiVolcanoReport = Json<StoredVolcanoReport>;

/** The latest state per monitored volcano and source. */
export interface ApiVolcanoStatusList {
  generatedAt: string;
  statuses: ApiVolcanoStatus[];
}

export interface ApiVolcanoChanges {
  days: number;
  changes: ApiVolcanoStatus[];
}

export interface ApiVolcanoReportList {
  weeks: number;
  reports: ApiVolcanoReport[];
}

/** Everything the server holds about one GVP volcano number. */
export interface ApiVolcanoDetail {
  number: number;
  statuses: ApiVolcanoStatus[];
  reports: ApiVolcanoReport[];
}

export interface ApiIssue {
  path: string;
  message: string;
}

export interface ApiError {
  error: string;
  issues?: ApiIssue[];
}

/** The two anomaly rasters a map can draw under its layers. */
export type FieldId = "gravity" | "magnetic";
export type FieldView = "global" | "wc";

/** One rendered raster and the legend that explains it; `/fields/fields.json` lists them. */
export interface FieldRaster {
  field: FieldId;
  view: FieldView;
  /** Path under the web root. */
  src: string;
  width: number;
  height: number;
  units: string;
  /** Ramp stops as [value, "#rrggbb"], ascending. */
  stops: [number, string][];
  /** Values labelled on the ramp. */
  ticks: number[];
  /** True when the stops are histogram-equalised rather than linear. */
  equalised: boolean;
  caption: string;
  source: { name: string; url: string; doi: string | null };
}

export interface FieldsFile {
  generated: string;
  rasters: FieldRaster[];
}

/** Elevations sampled along a section line by `GET /api/relief`. */
export interface ApiRelief {
  /** Spacing of the samples along the line, km. */
  stepKm: number;
  /** Elevation at each sample, metres above sea level (negative below). */
  metres: number[];
}
