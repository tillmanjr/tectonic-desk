import type { z } from "zod";
import {
  alertsSchema,
  auroraSchema,
  dstSchema,
  flaresSchema,
  goesFluxSchema,
  kp1mSchema,
  kp3hSchema,
  kpForecastSchema,
  magSchema,
  scalesSchema,
  windSchema,
  type AlertRow,
  type AuroraDoc,
  type DstRow,
  type FlareRow,
  type GoesFluxRow,
  type Kp1mRow,
  type Kp3hRow,
  type KpForecastRow,
  type MagRow,
  type ScalesDoc,
  type WindRow,
} from "./schema.js";

/** NOAA SWPC's static file server: public domain, `Cache-Control: max-age=60`, gzip on request. */
export const SWPC_BASE = "https://services.swpc.noaa.gov";

/** The files the jobs read, by method name, relative to `SWPC_BASE`. */
export const SWPC_FILES = {
  fetchKp1m: "/json/planetary_k_index_1m.json",
  fetchKp3h: "/products/noaa-planetary-k-index.json",
  fetchKpForecast: "/products/noaa-planetary-k-index-forecast.json",
  fetchDst: "/products/kyoto-dst.json",
  fetchMag: "/json/rtsw/rtsw_mag_1m.json",
  fetchWind: "/json/rtsw/rtsw_wind_1m.json",
  fetchXrays: "/json/goes/primary/xrays-6-hour.json",
  fetchProtons: "/json/goes/primary/integral-protons-6-hour.json",
  fetchFlares: "/json/goes/primary/xray-flares-7-day.json",
  fetchAlerts: "/products/alerts.json",
  fetchScales: "/products/noaa-scales.json",
  fetchAurora: "/json/ovation_aurora_latest.json",
  fetchHemiPower: "/text/aurora-nowcast-hemi-power.txt",
} as const;
export type SpaceFile = keyof typeof SWPC_FILES;

export interface SpaceClientOptions {
  fetch?: typeof fetch;
  userAgent: string;
  timeoutMs?: number;
  base?: string;
}

export interface SpaceClient {
  fetchKp1m: () => Promise<Kp1mRow[]>;
  fetchKp3h: () => Promise<Kp3hRow[]>;
  fetchKpForecast: () => Promise<KpForecastRow[]>;
  fetchDst: () => Promise<DstRow[]>;
  fetchMag: () => Promise<MagRow[]>;
  fetchWind: () => Promise<WindRow[]>;
  fetchXrays: () => Promise<GoesFluxRow[]>;
  fetchProtons: () => Promise<GoesFluxRow[]>;
  fetchFlares: () => Promise<FlareRow[]>;
  fetchAlerts: () => Promise<AlertRow[]>;
  fetchScales: () => Promise<ScalesDoc>;
  /** The newest OVATION Prime frame, about 140 KB gzipped on the wire. */
  fetchAurora: () => Promise<AuroraDoc>;
  /** The day's hemispheric power table, as text. */
  fetchHemiPower: () => Promise<string>;
}

export class SpaceHttpError extends Error {
  override name = "SpaceHttpError";
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`${url} answered ${String(status)}`);
  }
}

export function createSpaceClient(opts: SpaceClientOptions): SpaceClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const base = (opts.base ?? SWPC_BASE).replace(/\/$/, "");

  async function get<T>(
    file: SpaceFile,
    accept: string,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    const url = base + SWPC_FILES[file];
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

  const getJson = <T>(file: SpaceFile, schema: z.ZodType<T>): Promise<T> =>
    get(file, "application/json", async (res) => schema.parse(await res.json()));
  const getText = (file: SpaceFile): Promise<string> =>
    get(file, "text/plain", (res) => res.text());

  return {
    fetchKp1m: () => getJson("fetchKp1m", kp1mSchema),
    fetchKp3h: () => getJson("fetchKp3h", kp3hSchema),
    fetchKpForecast: () => getJson("fetchKpForecast", kpForecastSchema),
    fetchDst: () => getJson("fetchDst", dstSchema),
    fetchMag: () => getJson("fetchMag", magSchema),
    fetchWind: () => getJson("fetchWind", windSchema),
    fetchXrays: () => getJson("fetchXrays", goesFluxSchema),
    fetchProtons: () => getJson("fetchProtons", goesFluxSchema),
    fetchFlares: () => getJson("fetchFlares", flaresSchema),
    fetchAlerts: () => getJson("fetchAlerts", alertsSchema),
    fetchScales: () => getJson("fetchScales", scalesSchema),
    fetchAurora: () => getJson("fetchAurora", auroraSchema),
    fetchHemiPower: () => getText("fetchHemiPower"),
  };
}
