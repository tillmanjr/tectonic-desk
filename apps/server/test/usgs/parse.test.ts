import { describe, expect, it } from "vitest";
import {
  featureToEvent,
  parseFeedFeatures,
  parseProducts,
  pickPreferred,
  productToMechanism,
  type WeightedMechanism,
} from "../../src/usgs/parse.js";
import {
  detailDocumentSchema,
  feedDocumentSchema,
  type DetailDocument,
  type Feature,
  type FeedDocument,
  type Product,
} from "../../src/usgs/schema.js";
import { loadFixture, recordingLogger } from "../support/fixtures.js";

const feed = loadFixture("feed_day.json", feedDocumentSchema);
const detailUs = loadFixture("detail_us.json", detailDocumentSchema);
const detailNc = loadFixture("detail_nc.json", detailDocumentSchema);

const firstFeature = (): Feature => {
  const f = feed.features[0];
  if (!f) throw new Error("fixture is empty");
  return f as Feature;
};

const usTensor = (): Product => {
  const p = detailUs.properties.products?.["moment-tensor"]?.[0];
  if (!p) throw new Error("fixture lacks moment tensor");
  return p as Product;
};

const withoutKeys = (p: Product, prefixes: string[]): Product => ({
  ...p,
  properties: Object.fromEntries(
    Object.entries(p.properties).filter(([k]) => !prefixes.some((x) => k.startsWith(x))),
  ),
});

describe("featureToEvent", () => {
  it("maps the feed shape to an Event", () => {
    const f = firstFeature();
    const e = featureToEvent(f);
    expect(e.id).toBe(f.id);
    expect(e.time).toEqual(new Date(f.properties.time));
    expect(e.updated).toEqual(new Date(f.properties.updated));
    expect(e.longitude).toBe(f.geometry.coordinates[0]);
    expect(e.latitude).toBe(f.geometry.coordinates[1]);
    expect(e.depthKm).toBe(f.geometry.coordinates[2]);
    expect(e.mag).toBe(f.properties.mag);
    expect(e.magType).toBe(f.properties.magType);
    expect(e.place).toBe(f.properties.place);
    expect(e.eventType).toBe(f.properties.type);
    expect(e.types).toEqual(String(f.properties.types).split(",").filter(Boolean));
    expect(typeof e.tsunami).toBe("boolean");
    expect(e.raw).toMatchObject({ title: f.properties.title });
  });

  it("handles missing optional fields and a null depth", () => {
    const e = featureToEvent({
      id: "x",
      properties: { time: 1000, updated: 2000, tsunami: 1 },
      geometry: { coordinates: [10, 20, null] },
    });
    expect(e).toMatchObject({
      id: "x",
      latitude: 20,
      longitude: 10,
      depthKm: null,
      mag: null,
      magType: null,
      place: null,
      net: null,
      status: null,
      alert: null,
      sig: null,
      felt: null,
      cdi: null,
      mmi: null,
      tsunami: true,
      eventType: null,
      types: [],
    });
    expect(featureToEvent({ ...firstFeature(), geometry: { coordinates: [1, 2] } }).depthKm).toBe(
      null,
    );
    expect(
      featureToEvent({
        id: "y",
        properties: { time: 1, updated: 1 },
        geometry: { coordinates: [1, 2] },
      }).tsunami,
    ).toBe(false);
  });

  it("throws when coordinates lack lat or lon", () => {
    const bare = { id: "x", properties: { time: 1, updated: 1 } };
    expect(() => featureToEvent({ ...bare, geometry: { coordinates: [null, 1] } })).toThrow(
      /coordinates/,
    );
    expect(() => featureToEvent({ ...bare, geometry: { coordinates: [1] } })).toThrow(
      /coordinates/,
    );
  });

  it("strips products from raw when given a detail document", () => {
    const e = featureToEvent(detailUs);
    expect(e.raw).not.toHaveProperty("products");
    expect(e.types).toContain("moment-tensor");
  });
});

describe("parseFeedFeatures", () => {
  it("parses every valid feature and skips malformed ones with a warning", () => {
    const log = recordingLogger();
    const doc: FeedDocument = { features: [...feed.features, { id: "bad" }, 42] };
    const events = parseFeedFeatures(doc, log);
    expect(events).toHaveLength(feed.features.length);
    const warns = log.entries.filter((e) => e.level === "warn");
    expect(warns).toHaveLength(2);
    expect(warns[0]?.obj).toMatchObject({ featureId: "bad" });
    expect(warns[1]?.obj).toMatchObject({ featureId: undefined });
  });
});

describe("productToMechanism", () => {
  it("parses a full moment tensor", () => {
    const r = productToMechanism("us6000u1z5", "mt", usTensor());
    expect(r?.weight).toBe(218);
    expect(r?.mechanism).toMatchObject({
      eventId: "us6000u1z5",
      kind: "mt",
      source: "us",
      code: "us_6000u1z5_mww",
      preferred: false,
      strike1: 260.59,
      dip1: 85.06,
      rake1: -164.88,
      strike2: 169.26,
      dip2: 74.94,
      rake2: -5.12,
      tAzimuth: 34,
      tPlunge: 7,
      pAzimuth: 126,
      pPlunge: 14,
      nAzimuth: 278,
      nPlunge: 74,
      mrr: -1.46e18,
      mtt: 4.9e18,
      mpp: -3.44e18,
      mrt: 2.92e18,
      mrp: 1.143e18,
      mtp: -1.1228e19,
      scalarMoment: 1.24e19,
      mw: 6.7,
      depthKm: 30.5,
      percentDc: 0.8424,
      planesReconstructed: false,
      productUpdated: new Date(1791871467040),
    });
  });

  it("returns null for a DELETE product", () => {
    expect(productToMechanism("e", "mt", { ...usTensor(), status: "DELETE" })).toBeNull();
  });

  it("reconstructs planes from axes when none are published", () => {
    const r = productToMechanism("e", "mt", withoutKeys(usTensor(), ["nodal-plane"]));
    expect(r?.mechanism.planesReconstructed).toBe(true);
    const strikes = [r?.mechanism.strike1, r?.mechanism.strike2]
      .map((s) => Math.round(s ?? -1))
      .sort((a, b) => a - b);
    expect(strikes).toEqual([169, 261]);
  });

  it("leaves planes null when neither planes nor both axes are present", () => {
    const r = productToMechanism("e", "mt", withoutKeys(usTensor(), ["nodal-plane", "p-axis"]));
    expect(r?.mechanism).toMatchObject({
      strike1: null,
      planesReconstructed: false,
      pAzimuth: null,
    });
  });

  it("normalises percent-double-couple given as a percentage, falls back to depth, nulls non-Mw magnitudes and bad numbers", () => {
    const base = usTensor();
    const r = productToMechanism("e", "mt", {
      ...base,
      preferredWeight: undefined,
      properties: {
        ...base.properties,
        "percent-double-couple": "91.00",
        "derived-depth": "",
        depth: "12",
        "derived-magnitude-type": "mb",
        "scalar-moment": "not-a-number",
      },
    });
    expect(r?.weight).toBe(0);
    expect(r?.mechanism).toMatchObject({
      percentDc: 0.91,
      depthKm: 12,
      mw: null,
      scalarMoment: null,
    });
  });

  it("parses a first-motion product with planes only", () => {
    const fm = detailNc.properties.products?.["focal-mechanism"]?.[0];
    const r = productToMechanism("nc75442207", "fm", fm as Product);
    expect(r?.mechanism).toMatchObject({
      kind: "fm",
      source: "nc",
      strike1: 105,
      dip1: 70,
      rake1: 70,
      tAzimuth: null,
      mw: null,
      scalarMoment: null,
      planesReconstructed: false,
      depthKm: 4.78,
    });
  });
});

describe("pickPreferred", () => {
  const item = (kind: "mt" | "fm", code: string, updated: number, weight: number) => {
    const r = productToMechanism("e", kind, {
      source: "s",
      code,
      status: "UPDATE",
      updateTime: updated,
      properties: {},
    });
    if (!r) throw new Error("unreachable");
    const w: WeightedMechanism = { mechanism: r.mechanism, weight };
    return w;
  };

  it("marks the heaviest product per kind, breaking ties by latest update", () => {
    const undated = item("mt", "u", 0, 20);
    undated.mechanism.productUpdated = null;
    const out = pickPreferred([
      item("mt", "a", 1, 10),
      item("mt", "b", 2, 20),
      item("mt", "c", 3, 20),
      item("mt", "d", 1, 20),
      undated,
      item("fm", "e", 1, 1),
    ]);
    expect(out.map((x) => [x.code, x.preferred])).toEqual([
      ["a", false],
      ["b", false],
      ["c", true],
      ["d", false],
      ["u", false],
      ["e", true],
    ]);
  });

  it("returns an empty list for no products", () => {
    expect(pickPreferred([])).toEqual([]);
  });
});

describe("parseProducts", () => {
  it("collects tensors and first motions, applies preference, and reports deletions", () => {
    const log = recordingLogger();
    const products = detailNc.properties.products ?? {};
    const doc: DetailDocument = {
      ...detailNc,
      properties: {
        ...detailNc.properties,
        products: {
          ...products,
          "moment-tensor": [
            ...(products["moment-tensor"] ?? []),
            { source: "zz", code: "gone", status: "DELETE", updateTime: 1, properties: {} },
            { source: "bad" },
          ],
        },
      },
    };
    const { mechanisms, deleted } = parseProducts(doc, log);
    expect(mechanisms.map((m) => [m.kind, m.source, m.preferred])).toEqual([
      ["mt", "nc", true],
      ["mt", "us", false],
      ["fm", "nc", true],
    ]);
    const nc = mechanisms.find((m) => m.source === "nc" && m.kind === "mt");
    expect(nc?.planesReconstructed).toBe(true);
    expect(deleted).toEqual([{ eventId: "nc75442207", kind: "mt", source: "zz", code: "gone" }]);
    expect(log.entries.filter((e) => e.level === "warn")).toHaveLength(1);
  });

  it("handles a detail with no products", () => {
    const { mechanisms, deleted } = parseProducts(
      { ...detailUs, properties: { ...detailUs.properties, products: undefined } },
      recordingLogger(),
    );
    expect(mechanisms).toEqual([]);
    expect(deleted).toEqual([]);
  });
});
