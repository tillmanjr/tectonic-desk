import type { ApiEvent, ApiMechanism, ApiRegion } from "@tectonic/shared";
import type { Topo } from "../../src/lib/geo.js";

export const GLOBAL: ApiRegion = {
  id: "global",
  name: "Global",
  subtitle: "M4.5+ · past 7 days",
  minMag: 4.5,
  days: 7,
  bbox: null,
};
export const WC: ApiRegion = {
  id: "wc",
  name: "West Coast US",
  subtitle: "M2.5+ · past 30 days",
  minMag: 2.5,
  days: 30,
  bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
};

export function mech(over: Partial<ApiMechanism> = {}): ApiMechanism {
  return {
    id: 1,
    eventId: "us1",
    kind: "mt",
    source: "us",
    code: "us_1",
    preferred: true,
    strike1: 12.67,
    dip1: 68.63,
    rake1: -126.14,
    strike2: 256.15,
    dip2: 41.23,
    rake2: -33.56,
    tAzimuth: 128,
    tPlunge: 16,
    pAzimuth: 240,
    pPlunge: 52,
    nAzimuth: null,
    nPlunge: null,
    mrr: null,
    mtt: null,
    mpp: null,
    mrt: null,
    mrp: null,
    mtp: null,
    scalarMoment: 1.9e17,
    mw: 5.5,
    depthKm: 190.5,
    percentDc: 0.8949,
    planesReconstructed: false,
    productUpdated: "2026-10-12T05:00:00.000Z",
    ...over,
  };
}

export function event(over: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: "us1",
    time: "2026-10-12T04:38:12.859Z",
    updated: "2026-10-12T05:00:00.000Z",
    latitude: -18.723,
    longitude: -175.1452,
    depthKm: 195.212,
    mag: 5.5,
    magType: "mww",
    place: "122 km W of Neiafu, Tonga",
    net: "us",
    status: "reviewed",
    alert: null,
    sig: 465,
    felt: null,
    cdi: null,
    mmi: null,
    tsunami: false,
    eventType: "earthquake",
    types: ["moment-tensor"],
    mechanisms: [],
    ...over,
  };
}

export const SQUARE_OBJECTS: Record<"land" | "countries", Topo["objects"][string]> = {
  land: { type: "GeometryCollection", geometries: [{ type: "Polygon", arcs: [[0]] }] },
  countries: {
    type: "GeometryCollection",
    geometries: [{ type: "Polygon", arcs: [[0]], id: "1" }],
  },
};

export const squareTopology: Topo = {
  type: "Topology",
  arcs: [
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [0, -1],
    ],
  ],
  objects: SQUARE_OBJECTS,
};

export const plateSegments = [
  {
    b: "AF-AN",
    c: "trans",
    v: 13.2,
    p: [
      [-0.44, -54.85],
      [0.44, -54.45],
    ],
  },
  {
    b: "AF-AN",
    c: "spread",
    v: 13.2,
    p: [
      [0.44, -54.45],
      [0.97, -54.83],
    ],
  },
  {
    b: "PA-NA",
    c: "sub",
    v: 60,
    p: [
      [-125, 48],
      [-126, 49],
    ],
  },
  {
    b: "JF/NA",
    c: "sub",
    v: 35,
    p: [
      [-127, 42],
      [-126.5, 44],
      [-126, 46],
    ],
  },
];
