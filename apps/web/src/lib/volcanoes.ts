import type {
  ApiRegion,
  ApiVolcanoReport,
  ApiVolcanoStatus,
  BBox,
  Eruption,
  GeoFile,
  Volcano,
} from "@tectonic/shared";
import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { errorMessage, type ApiClient } from "./api.js";
import type { DatePrecision } from "./format.js";

/**
 * The volcano page's state and vocabulary: GVP's catalogue classified for
 * the map, the live agency statuses joined to it, the refine filter and the
 * selection. Agency scales are never merged; only a rank for sorting is
 * derived from them.
 */

export type EruptionClass = "recent" | "historic" | "holocene" | "unknown";

export const ERUPTION_CLASSES: Record<EruptionClass, { label: string; color: string }> = {
  recent: { label: "Erupted since 1950", color: "var(--vc-recent)" },
  historic: { label: "Erupted 1500 to 1949", color: "var(--vc-historic)" },
  holocene: { label: "Earlier Holocene", color: "var(--vc-holocene)" },
  unknown: { label: "Date unknown", color: "var(--vc-unknown)" },
};
export const ERUPTION_CLASS_CODES: readonly EruptionClass[] = [
  "recent",
  "historic",
  "holocene",
  "unknown",
];

export function eruptionClass(year: number | null): EruptionClass {
  if (year === null) return "unknown";
  if (year >= 1950) return "recent";
  if (year >= 1500) return "historic";
  return "holocene";
}

export type TypeGroup =
  | "stratovolcano"
  | "shield"
  | "caldera"
  | "cone"
  | "dome"
  | "complex"
  | "fissure"
  | "submarine"
  | "other";

export const TYPE_GROUPS: Record<TypeGroup, string> = {
  stratovolcano: "Stratovolcano",
  shield: "Shield",
  caldera: "Caldera",
  cone: "Cones, maars and craters",
  dome: "Lava dome",
  complex: "Complex or compound",
  fissure: "Fissure vents",
  submarine: "Submarine",
  other: "Other",
};
export const TYPE_GROUP_CODES = Object.keys(TYPE_GROUPS) as readonly TypeGroup[];

const TYPE_RULES: [RegExp, TypeGroup][] = [
  [/strato/i, "stratovolcano"],
  [/shield/i, "shield"],
  [/caldera/i, "caldera"],
  [/submarine/i, "submarine"],
  [/cone|maar|tuff|crater/i, "cone"],
  [/dome/i, "dome"],
  [/complex|compound/i, "complex"],
  [/fissure/i, "fissure"],
];

/** GVP's primary volcano type folded into a handful of groups. */
export function typeGroup(type: string): TypeGroup {
  for (const [re, group] of TYPE_RULES) if (re.test(type)) return group;
  return "other";
}

export type SettingGroup = "subduction" | "rift" | "intraplate" | "unknown";

export const SETTING_GROUPS: Record<SettingGroup, string> = {
  subduction: "Subduction zone",
  rift: "Rift zone",
  intraplate: "Intraplate",
  unknown: "Setting unknown",
};
export const SETTING_GROUP_CODES = Object.keys(SETTING_GROUPS) as readonly SettingGroup[];

export function settingGroup(setting: string | null): SettingGroup {
  if (setting === null) return "unknown";
  if (/subduction/i.test(setting)) return "subduction";
  if (/rift/i.test(setting)) return "rift";
  if (/intraplate/i.test(setting)) return "intraplate";
  return "unknown";
}

export type StatusFilter = "elevated" | "continuing" | "monitored";

export const STATUS_FILTERS: Record<StatusFilter, string> = {
  elevated: "Elevated alert (USGS or GeoNet)",
  continuing: "Continuing eruption (GVP)",
  monitored: "Monitored by USGS or GeoNet",
};
export const STATUS_FILTER_CODES = Object.keys(STATUS_FILTERS) as readonly StatusFilter[];

export interface VolcanoFilter {
  setting: SettingGroup | null;
  type: TypeGroup | null;
  age: EruptionClass | null;
  status: StatusFilter | null;
}

export const EMPTY_VOLCANO_FILTER: VolcanoFilter = {
  setting: null,
  type: null,
  age: null,
  status: null,
};

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  allowed.find((a) => a === v) ?? null;

export function parseVolcanoFilter(query: Record<string, unknown>): VolcanoFilter {
  return {
    setting: pick(query.setting, SETTING_GROUP_CODES),
    type: pick(query.type, TYPE_GROUP_CODES),
    age: pick(query.age, ERUPTION_CLASS_CODES),
    status: pick(query.status, STATUS_FILTER_CODES),
  };
}

export function volcanoFilterQuery(
  f: VolcanoFilter,
): Record<keyof VolcanoFilter, string | undefined> {
  return {
    setting: f.setting ?? undefined,
    type: f.type ?? undefined,
    age: f.age ?? undefined,
    status: f.status ?? undefined,
  };
}

export const isVolcanoFilterActive = (f: VolcanoFilter): boolean =>
  f.setting !== null || f.type !== null || f.age !== null || f.status !== null;

/** A sort rank from an agency status; 0 is normal or unassigned. Not a unified scale. */
export function statusRank(s: ApiVolcanoStatus): number {
  if (s.source === "geonet") {
    const n = Number(s.level);
    return Number.isFinite(n) ? n : 0;
  }
  switch (s.level) {
    case "WARNING":
      return 4;
    case "WATCH":
      return 3;
    case "ADVISORY":
      return 2;
    default:
      return 0;
  }
}

export const isElevated = (s: ApiVolcanoStatus): boolean => statusRank(s) > 0;

const cap = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

/** "USGS Watch · Orange", "GeoNet level 2 · Yellow". */
export function statusLabel(s: ApiVolcanoStatus): string {
  const agency = s.source === "usgs" ? "USGS" : "GeoNet";
  const level = s.source === "usgs" ? cap(s.level) : `level ${s.level}`;
  return s.color === null ? `${agency} ${level}` : `${agency} ${level} · ${cap(s.color)}`;
}

/** The CSS colour for an aviation colour code; grey for green or none. */
export function aviationColor(color: string | null): string {
  switch (color) {
    case "YELLOW":
      return "var(--av-yellow)";
    case "ORANGE":
      return "var(--av-orange)";
    case "RED":
      return "var(--av-red)";
    default:
      return "var(--muted)";
  }
}

export function inBBox(v: Volcano, bbox: BBox | null): boolean {
  if (bbox === null) return true;
  return (
    v.lat >= bbox.minLat && v.lat <= bbox.maxLat && v.lon >= bbox.minLon && v.lon <= bbox.maxLon
  );
}

const EARTH_KM = 6371;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** "2022-11-27", "1669", "6190 BCE", with GVP's modifier and uncertainty when present. */
export function eruptionStart(e: Eruption): string {
  const year = e.startYear > 0 ? String(e.startYear) : `${String(1 - e.startYear)} BCE`;
  const pad = (n: number): string => String(n).padStart(2, "0");
  let s = year;
  if (e.startMonth !== null && e.startYear > 0) {
    s += `-${pad(e.startMonth)}`;
    if (e.startDay !== null) s += `-${pad(e.startDay)}`;
  }
  if (e.startModifier !== null) s = `${e.startModifier}${s}`;
  if (e.startYearUncertainty !== null) s += ` ± ${String(e.startYearUncertainty)}`;
  return s;
}

export interface EruptionAnchor {
  date: Date;
  precision: DatePrecision;
  continuing: boolean;
  label: string;
}
const startMs = (e: Eruption): number =>
  Date.UTC(e.startYear, (e.startMonth ?? 1) - 1, e.startDay ?? 1);
const latestOf = (list: Eruption[]): Eruption | null =>
  list.reduce<Eruption | null>((a, e) => (a === null || startMs(e) > startMs(a) ? e : a), null);

/** The eruption a volcano's seismicity is dated against: the continuing one with the latest start, else the latest start; CE dates only. */
export function eruptionAnchor(eruptions: Eruption[]): EruptionAnchor | null {
  const dated = eruptions.filter((e) => e.startYear > 0);
  const pick = latestOf(dated.filter((e) => e.continuing)) ?? latestOf(dated);
  if (pick === null) return null;
  return {
    date: new Date(startMs(pick)),
    precision: pick.startMonth === null ? "year" : pick.startDay === null ? "month" : "day",
    continuing: pick.continuing,
    label: eruptionStart(pick),
  };
}

/** The year a volcano last erupted as text, or "unknown". */
export const lastEruptionText = (v: Volcano): string =>
  v.lastEruptionYear === null
    ? "last eruption unknown"
    : v.lastEruptionYear > 0
      ? `last erupted ${String(v.lastEruptionYear)}`
      : `last erupted ${String(1 - v.lastEruptionYear)} BCE`;

export interface Attention {
  status: ApiVolcanoStatus;
  volcano: Volcano | null;
}

export interface VolcanoSummary {
  elevatedUs: number;
  /** The highest USGS level in force, e.g. "Watch"; null when none is elevated. */
  highestUs: string | null;
  geonetActive: number;
  continuingInView: number;
  changes7d: number;
  /** Weekly-report "new activity" entries in the latest week; null when no report is held. */
  newThisWeek: number | null;
}

export interface VolcanoStore {
  volcanoes: ShallowRef<Volcano[]>;
  eruptions: ShallowRef<Eruption[]>;
  pulledAt: Ref<string | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  statuses: ShallowRef<ApiVolcanoStatus[]>;
  changes: ShallowRef<ApiVolcanoStatus[]>;
  reports: ShallowRef<ApiVolcanoReport[]>;
  liveAt: Ref<Date | null>;
  region: ShallowRef<ApiRegion | null>;
  filter: Ref<VolcanoFilter>;
  selectedNumber: Ref<number | null>;
  selected: ComputedRef<Volcano | null>;
  byNumber: ComputedRef<Map<number, Volcano>>;
  eruptionsOf: ComputedRef<Map<number, Eruption[]>>;
  /** One volcano's eruptions, newest first; empty for an unknown or null number. */
  eruptionsFor(number: number | null): Eruption[];
  continuing: ComputedRef<Set<number>>;
  statusesOf: ComputedRef<Map<number, ApiVolcanoStatus[]>>;
  /** Volcanoes inside the region's bbox (all of them for the global view). */
  inRegion: ComputedRef<Volcano[]>;
  filtered: ComputedRef<Volcano[]>;
  summary: ComputedRef<VolcanoSummary>;
  attention: ComputedRef<Attention[]>;
  rankOf(number: number): number;
  setRegion(r: ApiRegion | null): void;
  setFilter(f: VolcanoFilter): void;
  select(number: number | null): void;
  /** Loads the reference files once and the live state; safe to call repeatedly. */
  load(): Promise<void>;
  refreshLive(): Promise<void>;
}

const CHANGE_DAYS = 7;
const REPORT_WEEKS = 4;

export function createVolcanoStore(api: ApiClient, now: () => Date): VolcanoStore {
  const volcanoes = shallowRef<Volcano[]>([]);
  const eruptions = shallowRef<Eruption[]>([]);
  const pulledAt = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const statuses = shallowRef<ApiVolcanoStatus[]>([]);
  const changes = shallowRef<ApiVolcanoStatus[]>([]);
  const reports = shallowRef<ApiVolcanoReport[]>([]);
  const liveAt = ref<Date | null>(null);
  const region = shallowRef<ApiRegion | null>(null);
  const filter = ref<VolcanoFilter>(EMPTY_VOLCANO_FILTER);
  const selectedNumber = ref<number | null>(null);

  const byNumber = computed(() => new Map(volcanoes.value.map((v) => [v.number, v])));
  const selected = computed(() =>
    selectedNumber.value === null ? null : (byNumber.value.get(selectedNumber.value) ?? null),
  );
  const eruptionsOf = computed(() => {
    const m = new Map<number, Eruption[]>();
    for (const e of eruptions.value) {
      const list = m.get(e.volcano);
      if (list === undefined) m.set(e.volcano, [e]);
      else list.push(e);
    }
    for (const list of m.values())
      list.sort((a, b) => b.startYear - a.startYear || b.number - a.number);
    return m;
  });
  const eruptionsFor = (number: number | null): Eruption[] =>
    number === null ? [] : (eruptionsOf.value.get(number) ?? []);
  const continuing = computed(
    () => new Set(eruptions.value.filter((e) => e.continuing).map((e) => e.volcano)),
  );
  const statusesOf = computed(() => {
    const m = new Map<number, ApiVolcanoStatus[]>();
    for (const s of statuses.value) {
      if (s.number === null) continue;
      const list = m.get(s.number);
      if (list === undefined) m.set(s.number, [s]);
      else list.push(s);
    }
    return m;
  });
  const rankOf = (number: number): number =>
    Math.max(0, ...(statusesOf.value.get(number) ?? []).map(statusRank));

  const inRegion = computed(() => {
    const bbox = region.value?.bbox ?? null;
    return volcanoes.value.filter((v) => inBBox(v, bbox));
  });
  const filtered = computed(() => {
    const f = filter.value;
    return inRegion.value.filter((v) => {
      if (f.setting !== null && settingGroup(v.tectonicSetting) !== f.setting) return false;
      if (f.type !== null && typeGroup(v.type) !== f.type) return false;
      if (f.age !== null && eruptionClass(v.lastEruptionYear) !== f.age) return false;
      if (f.status === "elevated") return rankOf(v.number) > 0;
      if (f.status === "continuing") return continuing.value.has(v.number);
      if (f.status === "monitored") return statusesOf.value.has(v.number);
      return true;
    });
  });

  const US_ORDER = ["WARNING", "WATCH", "ADVISORY"];
  const summary = computed<VolcanoSummary>(() => {
    const us = statuses.value.filter((s) => s.source === "usgs" && isElevated(s));
    const highest = US_ORDER.find((l) => us.some((s) => s.level === l)) ?? null;
    const geonet = statuses.value.filter((s) => s.source === "geonet" && isElevated(s)).length;
    const inView = new Set(inRegion.value.map((v) => v.number));
    const continuingInView = [...continuing.value].filter((n) => inView.has(n)).length;
    const latestWeek = reports.value[0]?.week ?? null;
    const newThisWeek =
      latestWeek === null
        ? null
        : reports.value.filter((r) => r.week === latestWeek && r.category === "new").length;
    return {
      elevatedUs: us.length,
      highestUs: highest === null ? null : cap(highest),
      geonetActive: geonet,
      continuingInView,
      changes7d: changes.value.length,
      newThisWeek,
    };
  });

  const attention = computed<Attention[]>(() => {
    const seen = new Map<string, ApiVolcanoStatus>();
    for (const s of [...statuses.value.filter(isElevated), ...changes.value]) {
      const key = `${s.source}:${s.key}`;
      const prev = seen.get(key);
      if (prev === undefined || prev.observedAt < s.observedAt) seen.set(key, s);
    }
    return [...seen.values()]
      .sort(
        (a, b) =>
          statusRank(b) - statusRank(a) ||
          b.observedAt.localeCompare(a.observedAt) ||
          a.name.localeCompare(b.name),
      )
      .map((status) => ({
        status,
        volcano: status.number === null ? null : (byNumber.value.get(status.number) ?? null),
      }));
  });

  let filesLoaded = false;
  let filesLoading: Promise<void> | null = null;
  /** Read through a call so the flag is not narrowed across the await in `load`. */
  const filesReady = (): boolean => filesLoaded;
  async function loadFiles(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [v, e] = await Promise.all([api.geo("volcanoes"), api.geo("eruptions")]);
      const vf = v as GeoFile<Volcano>;
      const ef = e as GeoFile<Eruption>;
      volcanoes.value = vf.items;
      eruptions.value = ef.items;
      pulledAt.value = vf.meta.pulledAt;
      filesLoaded = true;
    } catch (err) {
      error.value = errorMessage(err);
    } finally {
      loading.value = false;
      filesLoading = null;
    }
  }
  async function refreshLive(): Promise<void> {
    try {
      const [s, c, r] = await Promise.all([
        api.volcanoStatus(),
        api.volcanoChanges(CHANGE_DAYS),
        api.volcanoReports(REPORT_WEEKS),
      ]);
      statuses.value = s.statuses;
      changes.value = c.changes;
      reports.value = r.reports;
      liveAt.value = now();
      error.value = null;
    } catch (err) {
      error.value = errorMessage(err);
    }
  }
  async function load(): Promise<void> {
    if (!filesReady()) {
      filesLoading ??= loadFiles();
      await filesLoading;
      if (!filesReady()) return;
    }
    await refreshLive();
  }

  return {
    volcanoes,
    eruptions,
    pulledAt,
    loading,
    error,
    statuses,
    changes,
    reports,
    liveAt,
    region,
    filter,
    selectedNumber,
    selected,
    byNumber,
    eruptionsOf,
    eruptionsFor,
    continuing,
    statusesOf,
    inRegion,
    filtered,
    summary,
    attention,
    rankOf,
    setRegion(r) {
      region.value = r;
    },
    setFilter(f) {
      filter.value = f;
    },
    select(number) {
      selectedNumber.value = number;
    },
    load,
    refreshLive,
  };
}
