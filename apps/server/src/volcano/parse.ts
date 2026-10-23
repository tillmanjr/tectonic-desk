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

/** The notice identifier at the end of a HANS notice URL (`DOI-USGS-AVO-2026-10-16T19:06:04+00:00`). */
export function noticeIdOf(url: string | null): string | null {
  if (url === null) return null;
  return /\/([^/?#]+)\/?$/.exec(url)?.[1] ?? null;
}

/** A USGS status above normal, whose current notice is worth reading for a synopsis. */
export const isElevatedUsgs = (s: VolcanoStatus): boolean =>
  (s.level !== "NORMAL" && s.level !== "UNASSIGNED") || (s.color !== null && s.color !== "GREEN");

const NOTICE_HEADING = /\(VNUM #\d+\)/;

/**
 * The one-line summary for a volcano in a HANS notice rendered as text (the
 * notice API's `text` format). A notice covers every volcano its observatory
 * reports on, each under a heading such as `GREAT SITKIN VOLCANO(VNUM #311120)`
 * followed by location and alert lines, a `Summary:` line and paragraphs. The
 * summary line is returned; a section without one gives its first paragraph
 * after the heading block; a notice that does not mention the volcano gives null.
 */
export function noticeSynopsis(text: string, vnum: string): string | null {
  const start = text.indexOf(`(VNUM #${vnum})`);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.search(NOTICE_HEADING);
  const section = next < 0 ? rest : rest.slice(0, next);
  const summary = /^\s*Summary:\s*(\S.*)$/m.exec(section)?.[1];
  const first = section
    .split(/\n\s*\n/)
    .slice(1)
    .map((p) => p.trim())
    .find((p) => p !== "");
  const line = summary ?? first;
  return line === undefined ? null : line.replace(/\s+/g, " ").trim();
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
 * The volcano an RSS item names and the link that names it. The live feed
 * (read 2026-10-22) links every item to the report page and carries the
 * number in the guid, `reports_weekly.cfm#vn_262000`; older shapes put
 * `volcano.cfm?vn=262000` in the link. The guid is tried before the link.
 */
function itemVolcano(candidates: (string | null)[]): { number: number; url: string } | null {
  for (const c of candidates) {
    if (c === null) continue;
    const url = decode(c);
    const m = /(?:[?&]vn=|#vn_)(\d+)/.exec(url);
    if (m !== null) return { number: Number(m[1]), url };
  }
  return null;
}

/** "new" for new activity or unrest, read from the title when it says which kind of report it is, else from the first words. */
function categoryOf(title: string, body: string): VolcanoReport["category"] {
  if (/continuing|ongoing/i.test(title)) return "ongoing";
  return /new (?:eruptive )?activity|unrest/i.test(`${title} ${body.slice(0, 200)}`)
    ? "new"
    : "ongoing";
}

/**
 * Entries of the Weekly Volcanic Activity Report RSS. Items are titled
 * `Name (Country) - Report for 8 October-14 October 2026 - New Eruptive
 * Activity` (or `… - Continuing Eruptive Activity`); the week is the item's
 * publication date. Items without a volcano number, a title or a date are
 * skipped.
 */
export function parseWeeklyReport(xml: string, fetchedAt: Date): VolcanoReport[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const out: VolcanoReport[] = [];
  for (const item of items) {
    const title = tagText(item, "title");
    const found = itemVolcano([tagText(item, "guid"), tagText(item, "link")]);
    const pub = tagText(item, "pubDate");
    const when = pub === null ? NaN : Date.parse(pub);
    if (title === null || found === null || Number.isNaN(when)) continue;
    const day = new Date(when);
    const week = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const body = decode(tagText(item, "description") ?? "");
    const stripped = decode(title)
      .replace(/\s*[(–-].*$/, "")
      .trim();
    out.push({
      number: found.number,
      name: stripped === "" ? decode(title) : stripped,
      week,
      category: categoryOf(title, body),
      title: decode(title),
      body,
      url: found.url,
      fetchedAt,
    });
  }
  return out;
}
