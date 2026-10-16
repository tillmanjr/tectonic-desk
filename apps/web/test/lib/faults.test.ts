import { describe, expect, it } from "vitest";
import {
  FAULT_AGES,
  faultFeatures,
  faultIndex,
  faultTitle,
  type FaultFeature,
} from "../../src/lib/faults.js";
import type { Topo } from "../../src/lib/geo.js";
import { faultsTopology } from "../support/faults.js";

const features = faultFeatures(faultsTopology);

describe("faultFeatures", () => {
  it("reads the faults object, promotes lines to multi-lines, drops other geometries, and normalises properties", () => {
    expect(features).toHaveLength(3);
    expect(features.map((f) => f.geometry.type)).toEqual([
      "MultiLineString",
      "MultiLineString",
      "MultiLineString",
    ]);
    expect(features[1]?.geometry.coordinates).toEqual([
      [
        [-121.9, 37.4],
        [-121.8, 37.3],
      ],
    ]);
    expect(features[0]?.properties).toEqual({
      id: "55-c",
      name: "Hayward fault zone",
      section: "Southern Hayward section",
      age: "historic",
      cert: "well",
      rate: "Between 1.0 and 5.0 mm/yr",
      sense: "Right lateral",
      dip: "Vertical",
    });
    expect(features[2]?.properties).toEqual({
      id: "?",
      name: "Unnamed fault",
      section: null,
      age: "other",
      cert: "well",
      rate: null,
      sense: null,
      dip: null,
    });
  });
  it("wraps a single geometry and returns nothing without a faults object", () => {
    const single: Topo = {
      type: "Topology",
      arcs: faultsTopology.arcs,
      objects: { faults: { type: "LineString", arcs: [0], properties: { name: "Lone" } } },
    };
    expect(faultFeatures(single).map((f) => f.properties.name)).toEqual(["Lone"]);
    expect(faultFeatures({ type: "Topology", arcs: [], objects: {} })).toEqual([]);
  });
});

describe("faultTitle", () => {
  it("joins the present parts with middle dots", () => {
    expect(faultTitle(features[0]?.properties ?? faultProps0())).toBe(
      "Hayward fault zone, Southern Hayward section · Historic (<150 yr) · Between 1.0 and 5.0 mm/yr · Right lateral · Dip vertical",
    );
    expect(faultTitle(features[1]?.properties ?? faultProps0())).toBe(
      "Pleasanton fault · Latest Quaternary (<15 ka), moderately constrained · Dip NE",
    );
    expect(faultTitle(features[2]?.properties ?? faultProps0())).toBe(
      "Unnamed fault · Age unspecified or Class B",
    );
    expect(Object.keys(FAULT_AGES)).toHaveLength(6);
  });
});

function faultProps0(): FaultFeature["properties"] {
  throw new Error("fixture missing");
}

describe("faultIndex", () => {
  const identity = (c: [number, number]): [number, number] => c;
  it("finds the feature with the nearest vertex inside the radius", () => {
    const idx = faultIndex(features, identity);
    expect(idx.nearest(-121.79, 37.31, 0.05)?.feature.properties.name).toBe("Pleasanton fault");
    expect(idx.nearest(-121.79, 37.31, 0.05)?.index).toBe(1);
    expect(idx.nearest(-121.79, 37.31, 0.001)).toBeNull();
    expect(idx.nearest(-122.1, 37.6, 1e-6)?.index).toBe(0);
  });
  it("skips points the projection rejects and malformed coordinates", () => {
    expect(faultIndex(features, () => null).nearest(-122.1, 37.6, 1)).toBeNull();
    const broken: FaultFeature = {
      type: "Feature",
      properties: features[0]?.properties ?? faultProps0(),
      geometry: { type: "MultiLineString", coordinates: [[[5], [1, 2]]] },
    };
    expect(faultIndex([broken], identity).nearest(1, 2, 1e-6)?.index).toBe(0);
    expect(faultIndex([broken], identity).nearest(5, 0, 1e-6)).toBeNull();
  });
  it("adds points along long segments so the middle of a straight run is still found", () => {
    const straight: FaultFeature = {
      type: "Feature",
      properties: features[0]?.properties ?? faultProps0(),
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [1, 0],
          ],
        ],
      },
    };
    expect(faultIndex([straight], identity).nearest(0.5, 0.01, 0.02)?.index).toBe(0);
    expect(faultIndex([straight], identity, 10).nearest(0.5, 0.01, 0.02)).toBeNull();
  });
});
