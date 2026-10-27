export * from "./mechanism/planes.js";
export * from "./mechanism/tensor.js";
export * from "./mechanism/classify.js";
export * from "./mechanism/solution.js";
export * from "./api.js";
export * from "./greatcircle.js";
export * from "./space.js";
export * from "./sun.js";

export type MechanismKind = "mt" | "fm";

/** An earthquake as received from USGS, before storage bookkeeping. */
export interface Event {
  id: string;
  time: Date;
  updated: Date;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  mag: number | null;
  magType: string | null;
  place: string | null;
  net: string | null;
  status: string | null;
  alert: string | null;
  sig: number | null;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  tsunami: boolean;
  /** USGS event type: earthquake, quarry blast, explosion, ... */
  eventType: string | null;
  /** Product types the feed advertises for this event, e.g. "moment-tensor". */
  types: string[];
  raw: Record<string, unknown>;
}

export interface StoredEvent extends Event {
  firstSeen: Date;
  lastSeen: Date;
  /** The event `updated` stamp at the last products fetch; null if never fetched. */
  detailCheckedUpdated: Date | null;
}

/** A moment tensor or first-motion focal mechanism product for an event. */
export interface Mechanism {
  eventId: string;
  kind: MechanismKind;
  source: string;
  code: string;
  preferred: boolean;
  strike1: number | null;
  dip1: number | null;
  rake1: number | null;
  strike2: number | null;
  dip2: number | null;
  rake2: number | null;
  tAzimuth: number | null;
  tPlunge: number | null;
  pAzimuth: number | null;
  pPlunge: number | null;
  nAzimuth: number | null;
  nPlunge: number | null;
  mrr: number | null;
  mtt: number | null;
  mpp: number | null;
  mrt: number | null;
  mrp: number | null;
  mtp: number | null;
  scalarMoment: number | null;
  mw: number | null;
  depthKm: number | null;
  /** Always a fraction in [0, 1]. */
  percentDc: number | null;
  planesReconstructed: boolean;
  productUpdated: Date | null;
  raw: Record<string, unknown>;
}

export interface StoredMechanism extends Mechanism {
  id: number;
}

export interface EventWithMechanisms extends StoredEvent {
  mechanisms: StoredMechanism[];
}

/** A generated reference file: a header and its rows. */
export interface GeoFile<T> {
  meta: { source: string; pulledAt: string; count: number };
  items: T[];
}

/** A Holocene volcano from the Smithsonian GVP catalogue (`data/geo/volcanoes.json`). */
export interface Volcano {
  /** GVP volcano number, the key every agency shares. */
  number: number;
  name: string;
  country: string;
  region: string;
  subregion: string | null;
  lat: number;
  lon: number;
  elevationM: number | null;
  /** GVP primary volcano type, e.g. "Stratovolcano(es)". */
  type: string;
  landform: string | null;
  rockType: string | null;
  tectonicSetting: string | null;
  lastEruptionYear: number | null;
  evidence: string | null;
  summary: string | null;
}

/** One GVP eruption record (`data/geo/eruptions.json`); dates carry GVP's uncertainty markers. */
export interface Eruption {
  number: number;
  volcano: number;
  activity: string;
  vei: number | null;
  veiModifier: string | null;
  startYear: number;
  startMonth: number | null;
  startDay: number | null;
  startYearUncertainty: number | null;
  startModifier: string | null;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  /** GVP's since-1960 layer still lists the eruption as continuing. */
  continuing: boolean;
}

export type VolcanoSource = "usgs" | "geonet";

/** An observed alert state for a monitored volcano; one row per change. */
export interface VolcanoStatus {
  source: VolcanoSource;
  /** USGS vnum or GeoNet volcanoID. */
  key: string;
  /** GVP number when known. */
  number: number | null;
  name: string;
  /** USGS alert level (NORMAL..WARNING, UNASSIGNED) or GeoNet level 0..5 as text. */
  level: string;
  /** Aviation colour code when the agency publishes one. */
  color: string | null;
  noticeAt: Date | null;
  synopsis: string | null;
  url: string | null;
  observedAt: Date;
}

export interface StoredVolcanoStatus extends VolcanoStatus {
  id: number;
}

/** One entry of the GVP/USGS Weekly Volcanic Activity Report. */
export interface VolcanoReport {
  number: number;
  name: string;
  /** The report week's publication date. */
  week: Date;
  category: "new" | "ongoing";
  title: string;
  body: string;
  url: string;
  fetchedAt: Date;
}

export interface StoredVolcanoReport extends VolcanoReport {
  id: number;
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}
