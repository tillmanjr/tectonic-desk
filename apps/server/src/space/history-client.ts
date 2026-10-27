import { SpaceHttpError } from "./client.js";
import {
  gfzDoc,
  gfzRawSchema,
  hapiInfoSchema,
  type GfzDoc,
  type GfzIndex,
  type HapiInfo,
} from "./history-schema.js";

/** GFZ Potsdam's Kp service (CC BY 4.0, Matzka et al. 2021, doi:10.5880/Kp.0001). */
export const GFZ_BASE = "https://kp.gfz.de/app/json/";
/** WDC for Geomagnetism, Kyoto, HAPI server (doi:10.17593/14515-74000, non-commercial use). */
export const KYOTO_BASE = "https://wdc.kugi.kyoto-u.ac.jp/hapi";
export const DST_DATASET = "hour_dst";

export interface HistoryClientOptions {
  fetch?: typeof fetch;
  userAgent: string;
  timeoutMs?: number;
  gfzBase?: string;
  kyotoBase?: string;
}

export interface HistoryClient {
  /** One index between two instants, inclusive; the whole archive fits one request. */
  fetchGfz: (index: GfzIndex, from: Date, to: Date) => Promise<GfzDoc>;
  fetchDstInfo: () => Promise<HapiInfo>;
  /**
   * Hourly Dst CSV (`time,dst,version`) between two instants, clipped to the dataset's range;
   * an empty string when the range misses it entirely.
   */
  fetchDst: (from: Date, to: Date) => Promise<string>;
}

/** An instant as the services take it: whole seconds, `Z`. */
export const serviceInstant = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export function createHistoryClient(opts: HistoryClientOptions): HistoryClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const gfzBase = opts.gfzBase ?? GFZ_BASE;
  const kyotoBase = (opts.kyotoBase ?? KYOTO_BASE).replace(/\/$/, "");

  async function get<T>(
    url: string,
    accept: string,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": opts.userAgent, accept },
        signal: controller.signal,
      });
      if (!res.ok) throw new SpaceHttpError(res.status, url);
      return await read(res);
    } finally {
      clearTimeout(timer);
    }
  }

  const fetchDstInfo = (): Promise<HapiInfo> =>
    get(`${kyotoBase}/info?id=${DST_DATASET}`, "application/json", async (res) =>
      hapiInfoSchema.parse(await res.json()),
    );

  return {
    fetchGfz: (index, from, to) =>
      get(
        `${gfzBase}?start=${serviceInstant(from)}&end=${serviceInstant(to)}&index=${index}`,
        "application/json",
        async (res) => gfzDoc(index, gfzRawSchema.parse(await res.json())),
      ),
    fetchDstInfo,
    async fetchDst(from, to) {
      const info = await fetchDstInfo();
      const start = Math.max(from.getTime(), Date.parse(info.startDate));
      const stop = Math.min(to.getTime(), Date.parse(info.stopDate));
      if (start >= stop) return "";
      const url =
        `${kyotoBase}/data?id=${DST_DATASET}&parameters=dstValue,versionCode` +
        `&time.min=${serviceInstant(new Date(start))}&time.max=${serviceInstant(new Date(stop))}`;
      return get(url, "text/csv", (res) => res.text());
    },
  };
}
