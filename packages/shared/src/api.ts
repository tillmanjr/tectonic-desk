import type { BBox, StoredEvent, StoredMechanism } from "./index.js";

/** The wire form of a domain object: Date becomes an ISO 8601 UTC string. */
export type Json<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type ApiMechanism = Omit<Json<StoredMechanism>, "raw">;

/** A listed event. `mechanisms` holds the preferred product per kind. */
export interface ApiEvent
  extends Omit<Json<StoredEvent>, "raw" | "firstSeen" | "lastSeen" | "detailCheckedUpdated"> {
  mechanisms: ApiMechanism[];
}

/** One event with every mechanism product and the raw USGS feed properties. */
export interface ApiEventDetail extends Omit<Json<StoredEvent>, "raw"> {
  mechanisms: ApiMechanism[];
  usgs: Record<string, unknown>;
}

/** The filters applied to a list request, after defaults. */
export interface ApiEventQuery {
  since: string;
  until: string | null;
  minMag: number | null;
  bbox: BBox | null;
  limit: number;
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

export type RunKind = "feed_day" | "feed_week" | "backfill" | "details";

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

export interface ApiIssue {
  path: string;
  message: string;
}

export interface ApiError {
  error: string;
  issues?: ApiIssue[];
}
