import type { Eruption, GeoFile, Volcano } from "@tectonic/shared";

/**
 * Turns pages of the Smithsonian Global Volcanism Program WFS (VOTW) into the
 * two reference files the web app reads: Holocene volcanoes and their
 * eruptions, with the "continuing" flag joined from GVP's since-1960 layer.
 */

export interface WfsFeature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

export interface WfsCollection {
  features: WfsFeature[];
}

export const GVP_SOURCE =
  "Smithsonian Institution, Global Volcanism Program, Volcanoes of the World (https://volcano.si.edu), via the GVP WFS";

/** A trimmed string, null when blank or not a string. */
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** A finite number, null otherwise. */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A month or day field, where GVP writes 0 for unknown. */
function dayPart(v: unknown): number | null {
  const n = num(v);
  return n === null || n <= 0 ? null : n;
}

/** [lon, lat] from a point geometry, null when absent or malformed. */
function lonLat(g: WfsFeature["geometry"]): [number, number] | null {
  if (g?.type !== "Point" || !Array.isArray(g.coordinates)) return null;
  const [lon, lat] = g.coordinates as unknown[];
  const x = num(lon);
  const y = num(lat);
  return x === null || y === null ? null : [x, y];
}

/** One Holocene volcano; null when the feature lacks a number, a name or a position. */
export function toVolcano(f: WfsFeature): Volcano | null {
  const p = f.properties;
  const number = num(p.Volcano_Number);
  const name = text(p.Volcano_Name);
  const at = lonLat(f.geometry);
  if (number === null || name === null || at === null) return null;
  return {
    number,
    name,
    country: text(p.Country) ?? "Unknown",
    region: text(p.Region) ?? "Unknown",
    subregion: text(p.Subregion),
    lat: at[1],
    lon: at[0],
    elevationM: num(p.Elevation),
    type: text(p.Primary_Volcano_Type) ?? "Unknown",
    landform: text(p.Volcanic_Landform),
    rockType: text(p.Major_Rock_Type),
    tectonicSetting: text(p.Tectonic_Setting),
    lastEruptionYear: num(p.Last_Eruption_Year),
    evidence: text(p.Evidence_Category),
    summary: text(p.Geological_Summary),
  };
}

/** Eruption numbers GVP's since-1960 layer flags as continuing. */
export function continuingSet(e3: WfsCollection): Set<number> {
  const out = new Set<number>();
  for (const f of e3.features) {
    const id = num(f.properties.Activity_ID);
    if (id !== null && f.properties.ContinuingEruption === "True") out.add(id);
  }
  return out;
}

/** One eruption record; null without a number, a volcano or a start year. */
export function toEruption(f: WfsFeature, continuing: Set<number>): Eruption | null {
  const p = f.properties;
  const number = num(p.Eruption_Number);
  const volcano = num(p.Volcano_Number);
  const startYear = num(p.StartDateYear);
  if (number === null || volcano === null || startYear === null) return null;
  return {
    number,
    volcano,
    activity: text(p.Activity_Type) ?? "Unknown",
    vei: num(p.ExplosivityIndexMax),
    veiModifier: text(p.ExplosivityIndexModifier),
    startYear,
    startMonth: dayPart(p.StartDateMonth),
    startDay: dayPart(p.StartDateDay),
    startYearUncertainty: num(p.StartDateYearUncertainty),
    startModifier: text(p.StartDateYearModifier) ?? text(p.StartDateDayModifier),
    endYear: num(p.EndDateYear),
    endMonth: dayPart(p.EndDateMonth),
    endDay: dayPart(p.EndDateDay),
    continuing: continuing.has(number),
  };
}

export interface GvpFiles {
  volcanoes: GeoFile<Volcano>;
  eruptions: GeoFile<Eruption>;
}

/** Both files, sorted by number, with the pull stamp in each header. */
export function buildGvpFiles(
  volcanoes: WfsCollection,
  eruptions: WfsCollection,
  e3: WfsCollection,
  pulledAt: Date,
): GvpFiles {
  const continuing = continuingSet(e3);
  const v = volcanoes.features
    .map(toVolcano)
    .filter((x): x is Volcano => x !== null)
    .sort((a, b) => a.number - b.number);
  const e = eruptions.features
    .map((f) => toEruption(f, continuing))
    .filter((x): x is Eruption => x !== null)
    .sort((a, b) => a.volcano - b.volcano || a.startYear - b.startYear || a.number - b.number);
  const meta = (count: number) => ({ source: GVP_SOURCE, pulledAt: pulledAt.toISOString(), count });
  return {
    volcanoes: { meta: meta(v.length), items: v },
    eruptions: { meta: meta(e.length), items: e },
  };
}
