import type { SpaceSample, SpaceSeries } from "@tectonic/shared";
import type { GfzDoc, GfzIndex } from "./history-schema.js";

/** The series each GFZ index feeds. */
export const GFZ_SERIES: Record<GfzIndex, SpaceSeries> = {
  Kp: "kp_gfz",
  Ap: "ap",
  SN: "ssn",
  Fobs: "f107",
};

/** Definitive rows, and every daily index whatever its status. */
export const GFZ_SOURCE = "gfz";
/** A Kp value GFZ still calls preliminary; replaced by a `gfz` row when the definitive one lands. */
export const GFZ_PRELIMINARY_SOURCE = "gfz-pre";
export const KYOTO_SOURCE = "kyoto";
/** Kyoto's fill for a missing hour. */
export const DST_FILL = 99999;
const HOUR_MS = 3_600_000;

/** Samples of the document's index; null values and unparsable times are skipped. */
export function parseGfz(doc: GfzDoc): SpaceSample[] {
  const series = GFZ_SERIES[doc.index];
  const out: SpaceSample[] = [];
  doc.values.forEach((v, i) => {
    const text = doc.datetime[i];
    if (v === null || !Number.isFinite(v) || text === undefined) return;
    const ms = Date.parse(text);
    if (Number.isNaN(ms)) return;
    const pre = doc.index === "Kp" && doc.status?.[i] === "pre";
    out.push({
      series,
      time: new Date(ms),
      source: pre ? GFZ_PRELIMINARY_SOURCE : GFZ_SOURCE,
      value: v,
    });
  });
  return out;
}

/**
 * Kyoto's header-less CSV, `time,dst,version` a line: the bin-centre time (`hh:29:30`) is
 * floored to the hour so the row shares its key with SWPC's relay, fills and malformed lines
 * are skipped, the version is not kept.
 */
export function parseKyotoDst(csv: string): SpaceSample[] {
  const out: SpaceSample[] = [];
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const ms = Date.parse(line.slice(0, comma));
    const rest = line.slice(comma + 1);
    const end = rest.indexOf(",");
    const value = Number(end < 0 ? rest : rest.slice(0, end));
    if (Number.isNaN(ms) || !Number.isFinite(value) || value === DST_FILL) continue;
    out.push({ series: "dst", time: new Date(ms - (ms % HOUR_MS)), source: KYOTO_SOURCE, value });
  }
  return out;
}
