export * from "./mechanism/planes.js";
export * from "./mechanism/tensor.js";
export * from "./mechanism/classify.js";
export * from "./mechanism/solution.js";
export * from "./api.js";

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

export interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}
