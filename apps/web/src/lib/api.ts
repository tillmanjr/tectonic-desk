import type {
  ApiError,
  ApiEventDetail,
  ApiEventGrid,
  ApiEventList,
  ApiEventSummary,
  ApiRegion,
  ApiStatus,
  ApiVolcanoChanges,
  ApiVolcanoDetail,
  ApiVolcanoReportList,
  ApiVolcanoStatusList,
} from "@tectonic/shared";

/** The window filters shared by the list and the aggregates. */
export interface EventsFilterQuery {
  since: string;
  until?: string;
  minMag?: number;
  bbox?: string;
}
export interface EventsQuery extends EventsFilterQuery {
  limit?: number;
}
export interface GridQuery extends EventsFilterQuery {
  cell: number;
}

export type GeoName = "plates" | "wc-land" | "wc-states" | "wc-qfaults" | "volcanoes" | "eruptions";

/** Function-typed properties (not methods) so tests can reference the spies unbound. */
export interface ApiClient {
  regions: () => Promise<ApiRegion[]>;
  events: (query: EventsQuery) => Promise<ApiEventList>;
  summary: (query: EventsFilterQuery) => Promise<ApiEventSummary>;
  grid: (query: GridQuery) => Promise<ApiEventGrid>;
  event: (id: string) => Promise<ApiEventDetail>;
  status: () => Promise<ApiStatus>;
  geo: (name: GeoName) => Promise<unknown>;
  volcanoStatus: () => Promise<ApiVolcanoStatusList>;
  volcanoChanges: (days: number) => Promise<ApiVolcanoChanges>;
  volcanoReports: (weeks: number) => Promise<ApiVolcanoReportList>;
  volcano: (number: number) => Promise<ApiVolcanoDetail>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function toParams(q: EventsFilterQuery & { limit?: number; cell?: number }): string {
  const p = new URLSearchParams();
  p.set("since", q.since);
  if (q.until !== undefined) p.set("until", q.until);
  if (q.minMag !== undefined) p.set("minMag", String(q.minMag));
  if (q.bbox !== undefined) p.set("bbox", q.bbox);
  if (q.limit !== undefined) p.set("limit", String(q.limit));
  if (q.cell !== undefined) p.set("cell", String(q.cell));
  return p.toString();
}

export function createApiClient(fetchFn: FetchLike, base = "/api"): ApiClient {
  async function get<T>(path: string): Promise<T> {
    const res = await fetchFn(base + path, { headers: { accept: "application/json" } });
    if (!res.ok) {
      let message = `HTTP ${String(res.status)}`;
      try {
        const body = (await res.json()) as Partial<ApiError> | null;
        if (typeof body?.error === "string") message = body.error;
      } catch {
        // body was not JSON; keep the status message
      }
      throw new ApiRequestError(res.status, message);
    }
    return (await res.json()) as T;
  }
  return {
    regions: () => get("/regions"),
    events: (query) => get(`/events?${toParams(query)}`),
    summary: (query) => get(`/events/summary?${toParams(query)}`),
    grid: (query) => get(`/events/grid?${toParams(query)}`),
    event: (id) => get(`/events/${encodeURIComponent(id)}`),
    status: () => get("/status"),
    geo: (name) => get(`/geo/${name}`),
    volcanoStatus: () => get("/volcanoes/status"),
    volcanoChanges: (days) => get(`/volcanoes/changes?days=${String(days)}`),
    volcanoReports: (weeks) => get(`/volcanoes/reports?weeks=${String(weeks)}`),
    volcano: (number) => get(`/volcanoes/${String(number)}`),
  };
}
