import { describe, expect, it } from "vitest";
import {
  azimuth,
  azimuthText,
  corridorRing,
  DEFAULT_HALF_KM,
  lengthKm,
  linePoints,
  parseSection,
  pointAlong,
  profileOf,
  projectOnto,
  sectionQuery,
  surfacePointsOf,
  type Section,
} from "../../src/lib/section.js";
import { event } from "../support/events.js";
import { volcano } from "../support/volcanoes.js";

const eq: Section = { a: [0, 0], b: [10, 0], halfKm: 50 };
const sfla: Section = { a: [-122.42, 37.77], b: [-118.24, 34.05], halfKm: 50 };

describe("section query", () => {
  it("parses five numbers and rejects junk, out-of-range widths and a zero-length line", () => {
    expect(parseSection("-122.42,37.77,-118.24,34.05,50")).toEqual(sfla);
    expect(parseSection("1,2,3,4")).toBeNull();
    expect(parseSection("a,b,c,d,e")).toBeNull();
    expect(parseSection("0,0,10,0,2")).toBeNull();
    expect(parseSection("0,0,10,0,900")).toBeNull();
    expect(parseSection("0,0,0,0,50")).toBeNull();
    expect(parseSection("0,95,10,0,50")).toBeNull();
    expect(parseSection("200,0,10,0,50")).toBeNull();
    expect(parseSection(undefined)).toBeNull();
    expect(parseSection(["1,2,3,4,5"])).toBeNull();
    expect(DEFAULT_HALF_KM).toBe(50);
  });

  it("writes three decimals for the ends and none for the width, round-tripping", () => {
    const s: Section = { a: [-122.4194, 37.7749], b: [-118.2437, 34.0522], halfKm: 50.4 };
    expect(sectionQuery(s)).toBe("-122.419,37.775,-118.244,34.052,50");
    expect(parseSection(sectionQuery(s))).toEqual({
      a: [-122.419, 37.775],
      b: [-118.244, 34.052],
      halfKm: 50,
    });
  });
});

describe("length and azimuth", () => {
  it("measures great circles and initial bearings", () => {
    expect(lengthKm(eq)).toBeCloseTo(1111.95, 0);
    expect(azimuth(eq)).toBeCloseTo(90, 5);
    expect(azimuth({ ...eq, b: [0, 10] })).toBeCloseTo(0, 5);
    expect(lengthKm(sfla)).toBeCloseTo(559, -1);
    expect(azimuth(sfla)).toBeCloseTo(137, -1);
    expect(azimuthText(84)).toBe("N 84° E");
    expect(azimuthText(137)).toBe("S 43° E");
    expect(azimuthText(225)).toBe("S 45° W");
    expect(azimuthText(300)).toBe("N 60° W");
    expect(azimuthText(0)).toBe("N 0° E");
    expect(azimuthText(360)).toBe("N 0° E");
    expect(azimuthText(-90)).toBe("N 90° W");
  });
});

describe("projectOnto", () => {
  it("gives along and signed off distances, right of A→A′ positive", () => {
    const on = projectOnto(eq, 5, 0);
    expect(on.alongKm).toBeCloseTo(555.97, 0);
    expect(on.offKm).toBeCloseTo(0, 5);
    expect(projectOnto(eq, 5, -1).offKm).toBeCloseTo(111.19, 0);
    expect(projectOnto(eq, 5, 1).offKm).toBeCloseTo(-111.19, 0);
    expect(projectOnto(eq, -2, 0).alongKm).toBeCloseTo(-222.39, 0);
    expect(projectOnto(eq, 12, 0).alongKm).toBeCloseTo(1334.34, 0);
  });
});

describe("profileOf and surfacePointsOf", () => {
  it("keeps corridor events with a depth, in order along the line, and counts the rest", () => {
    const evs = [
      event({ id: "far", longitude: 5, latitude: 2, depthKm: 10 }),
      event({ id: "mid", longitude: 6, latitude: 0.2, depthKm: 30 }),
      event({ id: "near", longitude: 2, latitude: -0.3, depthKm: 10 }),
      event({ id: "nodepth", longitude: 4, latitude: 0, depthKm: null }),
      event({ id: "before", longitude: -1, latitude: 0, depthKm: 10 }),
      event({ id: "after", longitude: 11, latitude: 0, depthKm: 10 }),
    ];
    const p = profileOf(eq, evs);
    expect(p.points.map((x) => x.id)).toEqual(["near", "mid"]);
    expect(p.points[0]?.depthKm).toBe(10);
    expect(p.points[1]?.alongKm).toBeCloseTo(667.17, 0);
    expect(p.points[1]?.event.id).toBe("mid");
    expect(p.noDepth).toBe(1);
    const vs = [
      volcano({ number: 2, name: "Off", lon: 3, lat: 3 }),
      volcano({ number: 3, name: "Late", lon: 8, lat: 0 }),
      volcano({ number: 1, name: "On", lon: 3, lat: 0.1 }),
    ];
    const sp = surfacePointsOf(eq, vs);
    expect(sp.map((x) => x.name)).toEqual(["On", "Late"]);
    expect(sp[0]?.alongKm).toBeCloseTo(333.6, 0);
    expect(sp[0]?.number).toBe(1);
  });
});

describe("corridorRing, pointAlong and linePoints", () => {
  it("runs from A to A′ and offsets symmetrically", () => {
    expect(pointAlong(eq, 0).map((v) => Number(v.toFixed(6)))).toEqual([0, 0]);
    expect(pointAlong(eq, 1).map((v) => Number(v.toFixed(6)))).toEqual([10, 0]);
    expect(pointAlong(eq, 0.5)[0]).toBeCloseTo(5, 5);
    const ring = corridorRing(eq);
    expect(ring).toHaveLength(67);
    expect(ring[0]).toEqual(ring[66]);
    const lats = ring.map(([, lat]) => lat);
    expect(Math.max(...lats)).toBeCloseTo(0.4497, 3);
    expect(Math.min(...lats)).toBeCloseTo(-0.4497, 3);
    expect(ring[0]?.[1]).toBeCloseTo(0.4497, 3);
    const line = linePoints(eq);
    expect(line).toHaveLength(33);
    expect(line[16]?.[0]).toBeCloseTo(5, 5);
  });
});
