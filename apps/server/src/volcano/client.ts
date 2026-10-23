import type { z } from "zod";
import { errorMessage } from "../ingest/feed.js";
import { geonetDocSchema, hansListSchema, type GeonetDoc, type HansRow } from "./schema.js";

export const HANS_BASE = "https://volcanoes.usgs.gov/hans-public/api/volcano";
export const HANS_NOTICE_BASE = "https://volcanoes.usgs.gov/hans-public/api/notice";
export const GEONET_BASE = "https://api.geonet.org.nz";
export const WEEKLY_REPORT_URL = "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";
/**
 * A copy of the weekly report feed on the repository's `feeds` branch, which
 * `pnpm feeds:mirror` (scripts/weekly-report-mirror.js) refreshes through a
 * browser on an ordinary machine, because volcano.si.edu refuses every other
 * client and every datacenter address. Read only when the feed itself answers
 * with an error, so the server goes back to the source by itself should GVP
 * let it through.
 */
export const WEEKLY_REPORT_MIRROR_URL =
  "https://raw.githubusercontent.com/tillmanjr/tectonic-desk/feeds/WeeklyVolcanoRSS.xml";
/** volcano.si.edu sits behind a bot filter; this agent names the site in case GVP allows it through. */
export const WEEKLY_REPORT_AGENT =
  "Mozilla/5.0 (compatible; TectonicDesk/0.0; +https://tectonicdesk.org)";
const RSS_ACCEPT = "application/rss+xml, application/xml";

export interface VolcanoClientOptions {
  fetch?: typeof fetch;
  userAgent: string;
  timeoutMs?: number;
  hansBase?: string;
  hansNoticeBase?: string;
  geonetBase?: string;
  weeklyReportUrl?: string;
  /** null turns the fallback off. */
  weeklyReportMirrorUrl?: string | null;
}

export interface WeeklyReportFetch {
  xml: string;
  /** The URL that answered: the feed itself or the mirror. */
  url: string;
}

export interface VolcanoClient {
  fetchHansMonitored: () => Promise<HansRow[]>;
  fetchHansElevated: () => Promise<HansRow[]>;
  /** A HANS notice as plain text, by its identifier (`DOI-USGS-AVO-2026-10-16T19:06:04+00:00`). */
  fetchHansNoticeText: (id: string) => Promise<string>;
  fetchGeonet: () => Promise<GeonetDoc>;
  /** The RSS document of the GVP/USGS Weekly Volcanic Activity Report, from the feed or, failing that, the mirror. */
  fetchWeeklyReport: () => Promise<WeeklyReportFetch>;
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

/**
 * An XML document decoded by the charset its declaration names (the GVP
 * feed is ISO-8859-1), falling back to UTF-8 when the label is unknown, with
 * the declaration rewritten to say so.
 */
export function decodeXml(bytes: ArrayBuffer): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const label = /encoding="([^"]+)"/i.exec(head)?.[1] ?? "utf-8";
  return decoderFor(label)
    .decode(bytes)
    .replace(/encoding="[^"]+"/i, 'encoding="UTF-8"');
}

const decoderFor = (label: string): InstanceType<typeof TextDecoder> => {
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder();
  }
};

export function createVolcanoClient(opts: VolcanoClientOptions): VolcanoClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const hans = (opts.hansBase ?? HANS_BASE).replace(/\/$/, "");
  const notice = (opts.hansNoticeBase ?? HANS_NOTICE_BASE).replace(/\/$/, "");
  const geonet = (opts.geonetBase ?? GEONET_BASE).replace(/\/$/, "");
  const weekly = opts.weeklyReportUrl ?? WEEKLY_REPORT_URL;
  const mirror =
    opts.weeklyReportMirrorUrl === undefined
      ? WEEKLY_REPORT_MIRROR_URL
      : opts.weeklyReportMirrorUrl;

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

  async function getXml(url: string, agent: string): Promise<WeeklyReportFetch> {
    const res = await get(url, RSS_ACCEPT, agent);
    return { xml: decodeXml(await res.arrayBuffer()), url };
  }

  return {
    fetchHansMonitored: () => getJson(`${hans}/getMonitoredVolcanoes`, hansListSchema),
    fetchHansElevated: () => getJson(`${hans}/getElevatedVolcanoes`, hansListSchema),
    fetchHansNoticeText: async (id) => {
      const url = `${notice}/getNoticeFormatted/${encodeURIComponent(id)}/text`;
      const res = await get(url, "text/plain", opts.userAgent);
      return res.text();
    },
    fetchGeonet: () => getJson(`${geonet}/volcano/val`, geonetDocSchema),
    fetchWeeklyReport: async () => {
      try {
        return await getXml(weekly, WEEKLY_REPORT_AGENT);
      } catch (feedErr) {
        const feedReason = errorMessage(feedErr);
        if (mirror === null) throw new Error(feedReason, { cause: feedErr });
        try {
          return await getXml(mirror, opts.userAgent);
        } catch (mirrorErr) {
          throw new Error(`${feedReason}; mirror: ${errorMessage(mirrorErr)}`, {
            cause: mirrorErr,
          });
        }
      }
    },
  };
}
