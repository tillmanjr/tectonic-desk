import type { VolcanoReport, VolcanoStatus } from "@tectonic/shared";
import type { GeonetDoc, HansRow } from "./schema.js";

/**
 * Live feeds to the domain types. Each agency keeps its own scale: USGS alert
 * levels and aviation colours, GeoNet levels 0 to 5 with a colour; nothing
 * here converts one into the other.
 */

/** GeoNet volcano ids to GVP numbers; GeoNet entries without a Holocene GVP record map to nothing. */
export const GEONET_NUMBERS: Readonly<Record<string, number>> = {
  aucklandvolcanicfield: 241020,
  mayorisland: 241021,
  taranakiegmont: 241030,
  whiteisland: 241040,
  okataina: 241050,
  taupo: 241070,
  tongariro: 241080,
  ngauruhoe: 241080,
  ruapehu: 241100,
  kermadecislands: 242030,
};

/** "2026-10-16 19:14:32" (UTC, no marker) to a Date; null when blank or unparseable. */
export function hansTime(s: string | null | undefined): Date | null {
  if (s === null || s === undefined || s.trim() === "") return null;
  const d = new Date(`${s.trim().replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const text = (v: string | null | undefined): string | null =>
  v === null || v === undefined || v.trim() === "" ? null : v.trim();

/** The HANS vnum is the GVP number as a string; anything else is not a number. */
function gvpNumber(vnum: string | null | undefined): number | null {
  const t = text(vnum);
  return t !== null && /^\d{6}$/.test(t) ? Number(t) : null;
}

function hansStatus(row: HansRow, observedAt: Date): VolcanoStatus {
  const key = text(row.vnum) ?? text(row.volcano_cd) ?? row.volcano_name;
  return {
    source: "usgs",
    key,
    number: gvpNumber(row.vnum),
    name: row.volcano_name,
    level: (text(row.alert_level) ?? "UNASSIGNED").toUpperCase(),
    color: text(row.color_code)?.toUpperCase() ?? null,
    noticeAt: hansTime(row.sent_utc),
    synopsis: null,
    url: text(row.notice_url),
    observedAt,
  };
}

/** Monitored rows merged with elevated rows (which carry the latest notice), one per key. */
export function parseHans(
  monitored: HansRow[],
  elevated: HansRow[],
  observedAt: Date,
): VolcanoStatus[] {
  const byKey = new Map<string, VolcanoStatus>();
  for (const row of [...monitored, ...elevated]) {
    const s = hansStatus(row, observedAt);
    byKey.set(s.key, s);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function parseGeonet(doc: GeonetDoc, observedAt: Date): VolcanoStatus[] {
  return doc.features
    .map(({ properties: p }): VolcanoStatus => ({
      source: "geonet",
      key: p.volcanoID,
      number: GEONET_NUMBERS[p.volcanoID] ?? null,
      name: p.volcanoTitle,
      level: String(p.level),
      color: text(p.acc)?.toUpperCase() ?? null,
      noticeAt: null,
      synopsis: text(p.activity),
      url: `https://www.geonet.org.nz/volcano/${p.volcanoID}`,
      observedAt,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** The trimmed text of the first `<name>` element in `item`, CDATA unwrapped; null when absent or empty. */
export function tagText(item: string, name: string): string | null {
  const lower = item.toLowerCase();
  const tag = name.toLowerCase();
  const open = lower.indexOf(`<${tag}`);
  if (open < 0) return null;
  const start = item.indexOf(">", open);
  const end = lower.indexOf(`</${tag}>`, start);
  if (start < 0 || end < 0) return null;
  const raw = item
    .slice(start + 1, end)
    .trim()
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .trim();
  return raw === "" ? null : raw;
}

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/**
 * Entries of the Weekly Volcanic Activity Report RSS. Each item links to the
 * volcano page (`vn=<number>`), so the number is read from the link; the week
 * is the item's publication date; an item is "new activity" when its title or
 * text says so, else "ongoing". Items without a number, a title or a date are
 * skipped. The feed was unreachable when this was written, so the shape is
 * the standard RSS 2.0 one and the parser is forgiving.
 */
export function parseWeeklyReport(xml: string, fetchedAt: Date): VolcanoReport[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const out: VolcanoReport[] = [];
  for (const item of items) {
    const title = tagText(item, "title");
    const link = tagText(item, "link");
    if (title === null || link === null) continue;
    const numberMatch = /[?&](?:amp;)?vn=(\d+)/.exec(decode(link));
    const pub = tagText(item, "pubDate");
    const when = pub === null ? NaN : Date.parse(pub);
    if (numberMatch === null || Number.isNaN(when)) continue;
    const day = new Date(when);
    const week = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const body = decode(tagText(item, "description") ?? "");
    const category = /new activity|unrest/i.test(`${title} ${body.slice(0, 200)}`)
      ? "new"
      : "ongoing";
    const stripped = decode(title)
      .replace(/\s*[(–-].*$/, "")
      .trim();
    out.push({
      number: Number(numberMatch[1]),
      name: stripped === "" ? decode(title) : stripped,
      week,
      category,
      title: decode(title),
      body,
      url: decode(link),
      fetchedAt,
    });
  }
  return out;
}
