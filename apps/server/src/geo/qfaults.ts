import type { FeatureCollection, Feature, LineString, MultiLineString, Position } from "geojson";
import { quantize } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, simplify } from "topojson-simplify";
import type { Objects, Topology } from "topojson-specification";

/**
 * Builds the West Coast Quaternary-fault file from pages of the USGS Qfaults
 * ArcGIS layer. The service hands back roughly 110,000 short line pieces for
 * the bbox; these functions fold them into one feature per fault section and
 * style class, stitch the pieces end to end so simplification has something
 * to work on, and emit a simplified, quantised topology.
 */

/** Age of last movement, after the USGS legend; `other` covers unspecified ages and Class B. */
export type AgeCode = "historic" | "latest" | "late" | "mid" | "undiff" | "other";
/** Mapping certainty: well constrained, moderately constrained, inferred. */
export type Cert = "well" | "mod" | "inf";

export interface FaultProps {
  id: string;
  name: string;
  section: string | null;
  age: AgeCode;
  cert: Cert;
  rate: string | null;
  sense: string | null;
  dip: string | null;
}

/** One feature as the ArcGIS layer returns it with `f=geojson`. */
export interface QfaultPiece {
  type: "Feature";
  geometry: LineString | MultiLineString;
  properties: Record<string, unknown>;
}

const AGES: [string, AgeCode][] = [
  ["historic", "historic"],
  ["latest Quaternary", "latest"],
  ["late Quaternary", "late"],
  ["middle and late Quaternary", "mid"],
  ["undifferentiated Quaternary", "undiff"],
];

/** Reads the layer's `symbology` text, "<age> <certainty>". */
export function parseSymbology(s: unknown): { age: AgeCode; cert: Cert } {
  const text = typeof s === "string" ? s : "";
  const age = AGES.find(([prefix]) => text.startsWith(`${prefix} `))?.[1] ?? "other";
  const cert: Cert = text.endsWith("Inferred")
    ? "inf"
    : text.endsWith("Moderately Constrained")
      ? "mod"
      : "well";
  return { age, cert };
}

/** A trimmed attribute, null when blank or "Unspecified". */
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t.toLowerCase() === "unspecified" ? null : t;
}

/** A [lon, lat] pair. */
export type Pt = [number, number];

/** A coordinate rounded to 5 decimals (about a metre). */
function toPt(c: Position): Pt {
  const [x, y] = c;
  if (x === undefined || y === undefined) throw new Error(`bad coordinate ${JSON.stringify(c)}`);
  return [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5];
}

/**
 * Ends closer than this (in degrees, about 50 m) are treated as touching;
 * that is under a pixel at the map's maximum zoom. The source pieces rarely
 * share a vertex exactly even where one trace continues into the next.
 */
export const STITCH_TOLERANCE = 5e-4;

/** The first (`0`) or last (`-1`) point of a line; lines are never empty. */
function end(line: Pt[], which: 0 | -1): Pt {
  const p = line.at(which);
  if (p === undefined) throw new Error("empty line");
  return p;
}

/**
 * Joins lines whose ends meet into longer lines, reversing a line when its
 * end meets another's end. Pieces that touch nothing stay as they are.
 */
export function stitchLines(lines: Pt[][], tol = STITCH_TOLERANCE): Pt[][] {
  const free = new Map(lines.entries());
  const cells = new Map<string, number[]>();
  const cellOf = (p: Pt): string =>
    `${String(Math.floor(p[0] / tol))},${String(Math.floor(p[1] / tol))}`;
  const index = (p: Pt, i: number): void => {
    const k = cellOf(p);
    const list = cells.get(k);
    if (list === undefined) cells.set(k, [i]);
    else list.push(i);
  };
  for (const [i, l] of lines.entries()) {
    index(end(l, 0), i);
    index(end(l, -1), i);
  }
  const touches = (a: Pt, b: Pt): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
  /** An unused line with an end at `p`, oriented to start there, searched over the neighbouring cells. */
  const takeFrom = (p: Pt): Pt[] | null => {
    const cx = Math.floor(p[0] / tol);
    const cy = Math.floor(p[1] / tol);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of cells.get(`${String(cx + dx)},${String(cy + dy)}`) ?? []) {
          const l = free.get(i);
          if (l === undefined) continue;
          if (touches(end(l, 0), p)) {
            free.delete(i);
            return l;
          }
          if (touches(end(l, -1), p)) {
            free.delete(i);
            return [...l].reverse();
          }
        }
      }
    }
    return null;
  };
  const out: Pt[][] = [];
  for (const [i, l] of lines.entries()) {
    if (!free.delete(i)) continue;
    let chain = [...l];
    for (let next = takeFrom(end(chain, -1)); next !== null;) {
      chain.push(...next.slice(1));
      next = takeFrom(end(chain, -1));
    }
    for (let prev = takeFrom(end(chain, 0)); prev !== null;) {
      chain = [...prev.slice(1).reverse(), ...chain];
      prev = takeFrom(end(chain, 0));
    }
    out.push(chain);
  }
  return out;
}

/** Groups pieces by fault section and style into one stitched MultiLineString each, coordinates to 5 decimals. */
export function mergeTraces(pieces: QfaultPiece[]): Feature<MultiLineString, FaultProps>[] {
  const groups = new Map<string, { props: FaultProps; lines: Pt[][] }>();
  for (const piece of pieces) {
    const p = piece.properties;
    const faultId = text(p.fault_id) ?? "?";
    const sectionId = text(p.section_id);
    const props: FaultProps = {
      id: sectionId === null ? faultId : `${faultId}-${sectionId}`,
      name: text(p.fault_name) ?? "Unnamed fault",
      section: text(p.section_name),
      ...parseSymbology(p.symbology),
      rate: text(p.slip_rate),
      sense: text(p.slip_sense),
      dip: text(p.dip_direction),
    };
    const g = piece.geometry;
    const lines = (g.type === "LineString" ? [g.coordinates] : g.coordinates)
      .filter((l) => l.length > 0)
      .map((l) => l.map(toPt));
    const key = JSON.stringify(props);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { props, lines });
    else group.lines.push(...lines);
  }
  return [...groups.values()].map(({ props, lines }) => ({
    type: "Feature",
    geometry: { type: "MultiLineString", coordinates: stitchLines(lines) },
    properties: props,
  }));
}

/**
 * Default Visvalingam threshold, in square degrees. The traces are mapped at
 * 1:24,000 with vertices a few tens of metres apart; this keeps bends larger
 * than about a pixel at the map's maximum zoom and roughly halves the file.
 */
export const DEFAULT_MIN_WEIGHT = 3e-6;

export interface TopologyOptions {
  /** Grid resolution of the quantised output. */
  quantization?: number;
  /** Visvalingam threshold in square degrees; vertices below it are dropped. */
  minWeight?: number;
}

export type FaultTopology = Topology<Objects<FaultProps>>;

/** One topology object, `faults`, simplified then quantised. */
export function faultTopology(
  features: Feature<MultiLineString, FaultProps>[],
  { quantization = 1e5, minWeight = DEFAULT_MIN_WEIGHT }: TopologyOptions = {},
): FaultTopology {
  const faults: FeatureCollection<MultiLineString, FaultProps> = {
    type: "FeatureCollection",
    features,
  };
  // topojson-server types every property bag as nullable; ours come from `mergeTraces`.
  const topo = topology({ faults }) as FaultTopology;
  return quantize(simplify(presimplify(topo), minWeight), quantization);
}
