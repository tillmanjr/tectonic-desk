import { readFileSync } from "node:fs";
import { WEEKLY_REPORT_URL, type VolcanoClient } from "../../src/volcano/client.js";
import type { GeonetDoc, HansRow } from "../../src/volcano/schema.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/volcano/${name}`, import.meta.url), "utf8");

export const hansMonitored = JSON.parse(fixture("hans-monitored.json")) as HansRow[];
export const hansElevated = JSON.parse(fixture("hans-elevated.json")) as HansRow[];
export const geonetVal = JSON.parse(fixture("geonet-val.json")) as GeonetDoc;
export const weeklyRss = fixture("wvar.rss");
/** Four items of the live feed of 2026-10-15, in its real shape. */
export const weeklyRssLive = fixture("wvar-2026-10-15.rss");
/** The AVO daily update of 2026-10-16 as the notice API's text format, trimmed. */
export const hansNoticeText = fixture("hans-notice-avo.txt");

export interface VolcanoStubOptions {
  monitored?: HansRow[] | Error;
  elevated?: HansRow[] | Error;
  geonet?: GeonetDoc | Error;
  weekly?: string | Error;
  /** Notice text by identifier; unlisted identifiers get the AVO fixture. */
  notices?: Record<string, string | Error>;
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
    fetchHansNoticeText: (id) => {
      calls.push(`notice:${id}`);
      return settle(opts.notices?.[id] ?? hansNoticeText);
    },
    fetchGeonet: () => {
      calls.push("geonet");
      return settle(opts.geonet ?? geonetVal);
    },
    fetchWeeklyReport: () => {
      calls.push("weekly");
      const weekly = opts.weekly ?? weeklyRss;
      return weekly instanceof Error
        ? Promise.reject(weekly)
        : Promise.resolve({ xml: weekly, url: WEEKLY_REPORT_URL });
    },
  };
}
