import { readFileSync } from "node:fs";
import type { HistoryClient } from "../../src/space/history-client.js";
import {
  gfzDoc,
  gfzRawSchema,
  hapiInfoSchema,
  type GfzDoc,
  type GfzIndex,
  type HapiInfo,
} from "../../src/space/history-schema.js";

const read = (rel: string): string =>
  readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), "utf8");

/** GFZ answers for 2026-09-29..10-01 (Kp: 09-30..10-01, definitive then preliminary, one null). */
export const gfzRaw = (index: GfzIndex): GfzDoc =>
  gfzDoc(index, gfzRawSchema.parse(JSON.parse(read(`gfz/${index}.json`))));
export const dstInfo: HapiInfo = hapiInfoSchema.parse(JSON.parse(read("kyoto/hour_dst_info.json")));
/** Nine real hours from 1989, 2024 and 2026, a fill, two malformed lines and one without a version. */
export const dstCsv = read("kyoto/hour_dst.csv");

export type GfzAnswer = Error | ((index: GfzIndex, from: Date, to: Date) => Promise<GfzDoc>);

export interface HistoryStubOptions {
  fetchGfz?: GfzAnswer;
  fetchDstInfo?: HapiInfo | Error;
  fetchDst?: string | Error;
}

export interface StubHistory extends HistoryClient {
  /** `gfz:Kp`, `dstInfo`, `dst` per call, in order. */
  calls: string[];
  /** The `[from, to]` of every GFZ and Dst data request, in order. */
  ranges: [Date, Date][];
}

/** A history client answering from the fixtures unless overridden. */
export function stubHistory(opts: HistoryStubOptions = {}): StubHistory {
  const calls: string[] = [];
  const ranges: [Date, Date][] = [];
  const settle = <T>(over: T | Error | undefined, fallback: T): Promise<T> =>
    over instanceof Error ? Promise.reject(over) : Promise.resolve(over ?? fallback);
  return {
    calls,
    ranges,
    fetchGfz(index, from, to) {
      calls.push(`gfz:${index}`);
      ranges.push([from, to]);
      const over = opts.fetchGfz;
      if (over instanceof Error) return Promise.reject(over);
      if (over !== undefined) return over(index, from, to);
      return Promise.resolve(gfzRaw(index));
    },
    fetchDstInfo() {
      calls.push("dstInfo");
      return settle(opts.fetchDstInfo, dstInfo);
    },
    fetchDst(from, to) {
      calls.push("dst");
      ranges.push([from, to]);
      return settle(opts.fetchDst, dstCsv);
    },
  };
}
