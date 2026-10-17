import { readFileSync } from "node:fs";
import type { VolcanoClient } from "../../src/volcano/client.js";
import type { GeonetDoc, HansRow } from "../../src/volcano/schema.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/volcano/${name}`, import.meta.url), "utf8");

export const hansMonitored = JSON.parse(fixture("hans-monitored.json")) as HansRow[];
export const hansElevated = JSON.parse(fixture("hans-elevated.json")) as HansRow[];
export const geonetVal = JSON.parse(fixture("geonet-val.json")) as GeonetDoc;
export const weeklyRss = fixture("wvar.rss");

export interface VolcanoStubOptions {
  monitored?: HansRow[] | Error;
  elevated?: HansRow[] | Error;
  geonet?: GeonetDoc | Error;
  weekly?: string | Error;
}

export interface StubVolcano extends VolcanoClient {
  calls: string[];
}

const settle = <T>(v: T | Error): Promise<T> =>
  v instanceof Error ? Promise.reject(v) : Promise.resolve(v);

/** A volcano client answering from the fixtures unless overridden. */
export function stubVolcano(opts: VolcanoStubOptions = {}): StubVolcano {
  const calls: string[] = [];
  return {
    calls,
    fetchHansMonitored: () => {
      calls.push("monitored");
      return settle(opts.monitored ?? hansMonitored);
    },
    fetchHansElevated: () => {
      calls.push("elevated");
      return settle(opts.elevated ?? hansElevated);
    },
    fetchGeonet: () => {
      calls.push("geonet");
      return settle(opts.geonet ?? geonetVal);
    },
    fetchWeeklyReport: () => {
      calls.push("weekly");
      return settle(opts.weekly ?? weeklyRss);
    },
  };
}
