import type { ApiRegion } from "@tectonic/shared";
import {
  geoConicConformal,
  geoGraticule,
  geoGraticule10,
  geoNaturalEarth1,
  type GeoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import { zoomIdentity, type ZoomTransform } from "d3-zoom";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";
import { feature, mesh } from "topojson-client";
import type { Objects, Topology } from "topojson-specification";

/** A topology whose objects carry non-null properties, as `mesh` requires. */
export type Topo = Topology<Objects<Record<string, unknown>>>;
type TopoObject = Topo["objects"][string];
import worldUrl from "world-atlas/countries-50m.json?url";

export { worldUrl };

export interface MapFrame {
  width: number;
  height: number;
  projection: GeoProjection;
  global: boolean;
}

/** Tighter fit points than the query bbox for presets that have them. */
const FIT_POINTS: Record<string, [number, number][]> = {
  wc: [
    [-130, 32],
    [-114, 32],
    [-130, 50],
    [-114, 50],
    [-122, 51],
  ],
};

export function frameFor(region: ApiRegion): MapFrame {
  if (region.bbox === null) {
    const width = 1000;
    const height = 520;
    const projection = geoNaturalEarth1()
      .rotate([-150, 0])
      .fitExtent(
        [
          [6, 6],
          [width - 6, height - 6],
        ],
        { type: "Sphere" },
      );
    return { width, height, projection, global: true };
  }
  const b = region.bbox;
  const width = 1000;
  const height = 700;
  const span = b.maxLat - b.minLat;
  const points = FIT_POINTS[region.id] ?? [
    [b.minLon, b.minLat],
    [b.maxLon, b.minLat],
    [b.minLon, b.maxLat],
    [b.maxLon, b.maxLat],
  ];
  const projection = geoConicConformal()
    .parallels([b.minLat + span / 4, b.maxLat - span / 4])
    .rotate([-(b.minLon + b.maxLon) / 2, 0])
    .clipExtent([
      [0, 0],
      [width, height],
    ])
    .fitExtent(
      [
        [10, 10],
        [width - 10, height - 10],
      ],
      { type: "MultiPoint", coordinates: points },
    );
  return { width, height, projection, global: false };
}

/** The transform that centres a point at a fixed magnification, or identity if it cannot be projected. */
export function zoomTransformFor(frame: MapFrame, lon: number, lat: number): ZoomTransform {
  const p = frame.projection([lon, lat]);
  if (p === null) return zoomIdentity;
  const k = frame.global ? 6 : 3;
  return zoomIdentity.translate(frame.width / 2 - k * p[0], frame.height / 2 - k * p[1]).scale(k);
}

export function graticuleFor(frame: MapFrame): MultiLineString {
  return frame.global ? geoGraticule10() : geoGraticule().step([2, 2])();
}

/** `path(object)`, with the empty-geometry null turned into an empty string. */
export function pathOf(path: GeoPath, object: GeoPermissibleObjects): string {
  return path(object) ?? "";
}

export type PlateClass = "sub" | "conv" | "spread" | "trans";

export const PLATE_CLASSES: Record<
  PlateClass,
  { name: string; width: number; dash: string | null }
> = {
  sub: { name: "Subduction", width: 2.2, dash: null },
  conv: { name: "Other convergent", width: 1.4, dash: null },
  spread: { name: "Spreading / rift", width: 1.2, dash: "1 2.5" },
  trans: { name: "Transform", width: 1.2, dash: "6 3" },
};

/** One PB2002 segment as served by `GET /api/geo/plates`. */
export interface PlateSegment {
  b: string;
  c: PlateClass;
  v: number;
  p: [number, number][];
}

export interface PlateProps {
  cls: PlateClass;
  title: string;
}

export function plateFeature(s: PlateSegment): Feature<LineString, PlateProps> {
  const cls = PLATE_CLASSES[s.c];
  return {
    type: "Feature",
    properties: {
      cls: s.c,
      title: `${cls.name} · ${s.b} · ${String(s.v)} mm/yr relative (PB2002)`,
    },
    geometry: { type: "LineString", coordinates: s.p },
  };
}

export interface Basemap {
  land: FeatureCollection;
  borders: MultiLineString;
}

function objectNamed(topo: Topo, name: string): TopoObject {
  const obj = topo.objects[name];
  if (obj === undefined) throw new Error(`topology has no ${name} object`);
  return obj;
}

function firstObject(topo: Topo): TopoObject {
  const first = Object.values(topo.objects)[0];
  if (first === undefined) throw new Error("topology has no objects");
  return first;
}

function collection(topo: Topo, obj: TopoObject): FeatureCollection {
  const f = feature(topo, obj);
  return f.type === "FeatureCollection" ? f : { type: "FeatureCollection", features: [f] };
}

/** Land and country borders from world-atlas `countries-50m.json`. */
export function worldBasemap(topo: Topo): Basemap {
  const land = objectNamed(topo, "land");
  const countries = objectNamed(topo, "countries");
  return { land: collection(topo, land), borders: mesh(topo, countries, (a, b) => a !== b) };
}

/** Land and state borders from the clipped Natural Earth files served by the API. */
export function regionBasemap(land: Topo, states: Topo): Basemap {
  const statesObj = firstObject(states);
  return {
    land: collection(land, firstObject(land)),
    borders: mesh(states, statesObj, (a, b) => a !== b),
  };
}

type FetchLike = (input: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

export async function loadWorld(fetchFn: FetchLike = (u) => fetch(u)): Promise<Topo> {
  const res = await fetchFn(worldUrl);
  if (!res.ok) throw new Error(`world basemap: HTTP ${String(res.status)}`);
  return (await res.json()) as Topo;
}
