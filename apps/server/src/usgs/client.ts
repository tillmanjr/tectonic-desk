import type { z } from "zod";
import {
  detailDocumentSchema,
  feedDocumentSchema,
  type DetailDocument,
  type FeedDocument,
} from "./schema.js";

export type FeedKind = "2.5_day" | "2.5_week";

export interface QueryParams {
  starttime: Date;
  endtime: Date;
  minmagnitude: number;
  limit: number;
}

export interface UsgsClientOptions {
  fetch?: typeof fetch;
  baseUrl: string;
  userAgent: string;
  timeoutMs?: number;
}

export interface UsgsClient {
  fetchFeed: (kind: FeedKind) => Promise<FeedDocument>;
  fetchDetail: (eventId: string) => Promise<DetailDocument>;
  fetchQuery: (params: QueryParams) => Promise<FeedDocument>;
}

export class UsgsHttpError extends Error {
  override name = "UsgsHttpError";
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`USGS responded ${String(status)} for ${url}`);
  }
}

export function createUsgsClient(opts: UsgsClientOptions): UsgsClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const base = opts.baseUrl.replace(/\/$/, "");

  async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": opts.userAgent, accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new UsgsHttpError(res.status, url);
      const body: unknown = await res.json();
      return schema.parse(body);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    fetchFeed: (kind) =>
      getJson(`${base}/earthquakes/feed/v1.0/summary/${kind}.geojson`, feedDocumentSchema),
    fetchDetail: (eventId) =>
      getJson(
        `${base}/fdsnws/event/1/query?${new URLSearchParams({ eventid: eventId, format: "geojson" }).toString()}`,
        detailDocumentSchema,
      ),
    fetchQuery: (p) =>
      getJson(
        `${base}/fdsnws/event/1/query?${new URLSearchParams({
          format: "geojson",
          starttime: p.starttime.toISOString(),
          endtime: p.endtime.toISOString(),
          minmagnitude: String(p.minmagnitude),
          orderby: "time-asc",
          limit: String(p.limit),
        }).toString()}`,
        feedDocumentSchema,
      ),
  };
}
