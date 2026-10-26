import { readFileSync } from "node:fs";
import type { z } from "zod";
import type { SpaceClient, SpaceFile } from "../../src/space/client.js";
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
} from "../../src/space/schema.js";

/** A SWPC fixture (trimmed from the live files of 2026-10-25), validated by its schema. */
function fixture<T>(name: string, schema: z.ZodType<T>): T {
  const text = readFileSync(new URL(`../fixtures/swpc/${name}`, import.meta.url), "utf8");
  return schema.parse(JSON.parse(text));
}

export const kp1m = fixture("planetary_k_index_1m.json", kp1mSchema);
export const kp3h = fixture("noaa-planetary-k-index.json", kp3hSchema);
export const kpForecast = fixture("noaa-planetary-k-index-forecast.json", kpForecastSchema);
export const dst = fixture("kyoto-dst.json", dstSchema);
export const mag = fixture("rtsw_mag_1m.json", magSchema);
export const wind = fixture("rtsw_wind_1m.json", windSchema);
export const xrays = fixture("xrays-6-hour.json", goesFluxSchema);
export const protons = fixture("integral-protons-6-hour.json", goesFluxSchema);
export const flares = fixture("xray-flares-7-day.json", flaresSchema);
export const alerts = fixture("alerts.json", alertsSchema);
export const scales = fixture("noaa-scales.json", scalesSchema);
export const aurora = fixture("ovation.json", auroraSchema);
export const hemiPower = readFileSync(
  new URL("../fixtures/swpc/hemi-power.txt", import.meta.url),
  "utf8",
);

type Answers = { [K in SpaceFile]: Awaited<ReturnType<SpaceClient[K]>> };
const answers: Answers = {
  fetchKp1m: kp1m,
  fetchKp3h: kp3h,
  fetchKpForecast: kpForecast,
  fetchDst: dst,
  fetchMag: mag,
  fetchWind: wind,
  fetchXrays: xrays,
  fetchProtons: protons,
  fetchFlares: flares,
  fetchAlerts: alerts,
  fetchScales: scales,
  fetchAurora: aurora,
  fetchHemiPower: hemiPower,
};

/** Per method, a replacement answer or an error to reject with. */
export type SpaceStubOptions = { [K in SpaceFile]?: Answers[K] | Error };

export interface StubSpace extends SpaceClient {
  calls: SpaceFile[];
}

/** A space client answering from the fixtures unless overridden. */
export function stubSpace(opts: SpaceStubOptions = {}): StubSpace {
  const calls: SpaceFile[] = [];
  const method =
    <T>(name: SpaceFile, fixtureAnswer: T, over: T | Error | undefined) =>
    (): Promise<T> => {
      calls.push(name);
      if (over instanceof Error) return Promise.reject(over);
      return Promise.resolve(over ?? fixtureAnswer);
    };
  return {
    calls,
    fetchKp1m: method("fetchKp1m", answers.fetchKp1m, opts.fetchKp1m),
    fetchKp3h: method("fetchKp3h", answers.fetchKp3h, opts.fetchKp3h),
    fetchKpForecast: method("fetchKpForecast", answers.fetchKpForecast, opts.fetchKpForecast),
    fetchDst: method("fetchDst", answers.fetchDst, opts.fetchDst),
    fetchMag: method("fetchMag", answers.fetchMag, opts.fetchMag),
    fetchWind: method("fetchWind", answers.fetchWind, opts.fetchWind),
    fetchXrays: method("fetchXrays", answers.fetchXrays, opts.fetchXrays),
    fetchProtons: method("fetchProtons", answers.fetchProtons, opts.fetchProtons),
    fetchFlares: method("fetchFlares", answers.fetchFlares, opts.fetchFlares),
    fetchAlerts: method("fetchAlerts", answers.fetchAlerts, opts.fetchAlerts),
    fetchScales: method("fetchScales", answers.fetchScales, opts.fetchScales),
    fetchAurora: method("fetchAurora", answers.fetchAurora, opts.fetchAurora),
    fetchHemiPower: method("fetchHemiPower", answers.fetchHemiPower, opts.fetchHemiPower),
  };
}
