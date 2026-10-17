import type { z } from "zod";
import { geonetDocSchema, hansListSchema, type GeonetDoc, type HansRow } from "./schema.js";

export const HANS_BASE = "https://volcanoes.usgs.gov/hans-public/api/volcano";
export const GEONET_BASE = "https://api.geonet.org.nz";
export const WEEKLY_REPORT_URL = "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";
/** volcano.si.edu sits behind a bot filter that refuses plain client agents. */
export const WEEKLY_REPORT_AGENT =
  "Mozilla/5.0 (compatible; TectonicDesk/0.0; +https://tectonicdesk.org)";

export interface VolcanoClientOptions {
  fetch?: typeof fetch;
  userAgent: string;
  timeoutMs?: number;
  hansBase?: string;
  geonetBase?: string;
  weeklyReportUrl?: string;
}

export interface VolcanoClient {
  fetchHansMonitored: () => Promise<HansRow[]>;
  fetchHansElevated: () => Promise<HansRow[]>;
  fetchGeonet: () => Promise<GeonetDoc>;
  /** The raw RSS document of the GVP/USGS Weekly Volcanic Activity Report. */
  fetchWeeklyReport: () => Promise<string>;
}

export class VolcanoHttpError extends Error {
  override name = "VolcanoHttpError";
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`${url} answered ${String(status)}`);
  }
}

export function createVolcanoClient(opts: VolcanoClientOptions): VolcanoClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const hans = (opts.hansBase ?? HANS_BASE).replace(/\/$/, "");
  const geonet = (opts.geonetBase ?? GEONET_BASE).replace(/\/$/, "");
  const weekly = opts.weeklyReportUrl ?? WEEKLY_REPORT_URL;

  async function get(url: string, accept: string, agent: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": agent, accept },
        signal: controller.signal,
      });
      if (!res.ok) throw new VolcanoHttpError(res.status, url);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    const res = await get(url, "application/json", opts.userAgent);
    const body: unknown = await res.json();
    return schema.parse(body);
  }

  return {
    fetchHansMonitored: () => getJson(`${hans}/getMonitoredVolcanoes`, hansListSchema),
    fetchHansElevated: () => getJson(`${hans}/getElevatedVolcanoes`, hansListSchema),
    fetchGeonet: () => getJson(`${geonet}/volcano/val`, geonetDocSchema),
    fetchWeeklyReport: async () => {
      const res = await get(weekly, "application/rss+xml, application/xml", WEEKLY_REPORT_AGENT);
      return res.text();
    },
  };
}
