import { planesFromAxes, type Event, type Mechanism, type MechanismKind } from "@tectonic/shared";
import type { IngestLogger } from "../ingest/context.js";
import type { MechanismKey } from "../repositories/mechanisms.js";
import {
  featureSchema,
  productSchema,
  type DetailDocument,
  type Feature,
  type FeedDocument,
  type Product,
} from "./schema.js";

/** Maps a feed feature (or a detail document, which has the same shape) to an Event. */
export function featureToEvent(f: Feature): Event {
  const [lon, lat, depth] = f.geometry.coordinates;
  if (lon === null || lon === undefined || lat === null || lat === undefined) {
    throw new Error(`feature ${f.id} has incomplete coordinates`);
  }
  const p = f.properties;
  const raw = Object.fromEntries(Object.entries(p).filter(([k]) => k !== "products"));
  return {
    id: f.id,
    time: new Date(p.time),
    updated: new Date(p.updated),
    latitude: lat,
    longitude: lon,
    depthKm: depth ?? null,
    mag: p.mag ?? null,
    magType: p.magType ?? null,
    place: p.place ?? null,
    net: p.net ?? null,
    status: p.status ?? null,
    alert: p.alert ?? null,
    sig: p.sig ?? null,
    felt: p.felt ?? null,
    cdi: p.cdi ?? null,
    mmi: p.mmi ?? null,
    tsunami: (p.tsunami ?? 0) !== 0,
    eventType: p.type ?? null,
    types: (p.types ?? "").split(",").filter((s) => s.length > 0),
    raw,
  };
}

function idOf(candidate: unknown): string | undefined {
  if (typeof candidate === "object" && candidate !== null && "id" in candidate) {
    return String(candidate.id);
  }
  return undefined;
}

/** Parses every feature in a feed; malformed ones are logged and skipped. */
export function parseFeedFeatures(doc: FeedDocument, log: IngestLogger): Event[] {
  const out: Event[] = [];
  for (const candidate of doc.features) {
    const parsed = featureSchema.safeParse(candidate);
    if (!parsed.success) {
      log.warn(
        { featureId: idOf(candidate), issues: parsed.error.issues },
        "skipping malformed feature",
      );
      continue;
    }
    out.push(featureToEvent(parsed.data));
  }
  return out;
}

function num(props: Record<string, string>, key: string): number | null {
  const v = props[key];
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface WeightedMechanism {
  mechanism: Mechanism;
  weight: number;
}

/**
 * Parses one moment-tensor or focal-mechanism product. Returns null for a
 * product whose status is DELETE. `preferred` is left false; see pickPreferred.
 */
export function productToMechanism(
  eventId: string,
  kind: MechanismKind,
  product: Product,
): WeightedMechanism | null {
  if (product.status === "DELETE") return null;
  const p = product.properties;

  let strike1 = num(p, "nodal-plane-1-strike");
  let dip1 = num(p, "nodal-plane-1-dip");
  let rake1 = num(p, "nodal-plane-1-rake");
  let strike2 = num(p, "nodal-plane-2-strike");
  let dip2 = num(p, "nodal-plane-2-dip");
  let rake2 = num(p, "nodal-plane-2-rake");
  const tAzimuth = num(p, "t-axis-azimuth");
  const tPlunge = num(p, "t-axis-plunge");
  const pAzimuth = num(p, "p-axis-azimuth");
  const pPlunge = num(p, "p-axis-plunge");

  const noPlanes = [strike1, dip1, rake1, strike2, dip2, rake2].every((v) => v === null);
  const haveAxes = tAzimuth !== null && tPlunge !== null && pAzimuth !== null && pPlunge !== null;
  let planesReconstructed = false;
  if (noPlanes && haveAxes) {
    const [a, b] = planesFromAxes(
      { azimuth: tAzimuth, plunge: tPlunge },
      { azimuth: pAzimuth, plunge: pPlunge },
    );
    strike1 = a.strike;
    dip1 = a.dip;
    rake1 = a.rake;
    strike2 = b.strike;
    dip2 = b.dip;
    rake2 = b.rake;
    planesReconstructed = true;
  }

  const rawDc = num(p, "percent-double-couple");
  const percentDc = rawDc === null ? null : rawDc > 1 ? rawDc / 100 : rawDc;
  const magType = p["derived-magnitude-type"] ?? "";
  const mw = /^mw/i.test(magType) ? num(p, "derived-magnitude") : null;

  return {
    weight: product.preferredWeight ?? 0,
    mechanism: {
      eventId,
      kind,
      source: product.source,
      code: product.code,
      preferred: false,
      strike1,
      dip1,
      rake1,
      strike2,
      dip2,
      rake2,
      tAzimuth,
      tPlunge,
      pAzimuth,
      pPlunge,
      nAzimuth: num(p, "n-axis-azimuth"),
      nPlunge: num(p, "n-axis-plunge"),
      mrr: num(p, "tensor-mrr"),
      mtt: num(p, "tensor-mtt"),
      mpp: num(p, "tensor-mpp"),
      mrt: num(p, "tensor-mrt"),
      mrp: num(p, "tensor-mrp"),
      mtp: num(p, "tensor-mtp"),
      scalarMoment: num(p, "scalar-moment"),
      mw,
      depthKm: num(p, "derived-depth") ?? num(p, "depth"),
      percentDc,
      planesReconstructed,
      productUpdated: new Date(product.updateTime),
      raw: p,
    },
  };
}

/** Marks the heaviest product of each kind as preferred; ties go to the latest update. */
export function pickPreferred(items: WeightedMechanism[]): Mechanism[] {
  const best = new Map<MechanismKind, WeightedMechanism>();
  for (const item of items) {
    const cur = best.get(item.mechanism.kind);
    const later =
      (item.mechanism.productUpdated?.getTime() ?? 0) >
      (cur?.mechanism.productUpdated?.getTime() ?? 0);
    if (!cur || item.weight > cur.weight || (item.weight === cur.weight && later)) {
      best.set(item.mechanism.kind, item);
    }
  }
  return items.map((item) => ({
    ...item.mechanism,
    preferred: best.get(item.mechanism.kind) === item,
  }));
}

const PRODUCT_KINDS: { key: string; kind: MechanismKind }[] = [
  { key: "moment-tensor", kind: "mt" },
  { key: "focal-mechanism", kind: "fm" },
];

export interface ParsedProducts {
  mechanisms: Mechanism[];
  deleted: MechanismKey[];
}

/** All mechanism products of a detail document, with preference applied and deletions listed. */
export function parseProducts(detail: DetailDocument, log: IngestLogger): ParsedProducts {
  const products = detail.properties.products ?? {};
  const weighted: WeightedMechanism[] = [];
  const deleted: MechanismKey[] = [];
  for (const { key, kind } of PRODUCT_KINDS) {
    for (const candidate of products[key] ?? []) {
      const parsed = productSchema.safeParse(candidate);
      if (!parsed.success) {
        log.warn(
          { eventId: detail.id, kind, issues: parsed.error.issues },
          "skipping malformed product",
        );
        continue;
      }
      const result = productToMechanism(detail.id, kind, parsed.data);
      if (result) weighted.push(result);
      else {
        deleted.push({
          eventId: detail.id,
          kind,
          source: parsed.data.source,
          code: parsed.data.code,
        });
      }
    }
  }
  return { mechanisms: pickPreferred(weighted), deleted };
}
