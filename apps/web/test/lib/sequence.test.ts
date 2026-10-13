import { describe, expect, it } from "vitest";
import { distanceKm, parentOf, sequenceOf } from "../../src/lib/sequence.js";
import { event } from "../support/events.js";

const main = event({
  id: "main",
  mag: 7.7,
  time: "2026-10-10T00:00:00Z",
  latitude: 0,
  longitude: 0,
});
const after1 = event({
  id: "a1",
  mag: 5.1,
  time: "2026-10-10T01:00:00Z",
  latitude: 0.5,
  longitude: 0.5,
});
const after2 = event({
  id: "a2",
  mag: 6.0,
  time: "2026-10-10T02:00:00Z",
  latitude: 1,
  longitude: 0,
});
const far = event({
  id: "far",
  mag: 6.9,
  time: "2026-10-10T03:00:00Z",
  latitude: 40,
  longitude: 40,
});
const before = event({
  id: "b",
  mag: 4.6,
  time: "2026-10-09T00:00:00Z",
  latitude: 0.1,
  longitude: 0.1,
});
const list = [main, after1, after2, far, before];
const now = new Date("2026-10-11T00:00:00Z");

describe("distanceKm", () => {
  it("measures great-circle distance", () => {
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
      111.2,
      0,
    );
    expect(distanceKm(main, main)).toBe(0);
  });
});

describe("sequenceOf / parentOf", () => {
  it("counts later events within 150 km of an M6.5+ mainshock", () => {
    expect(sequenceOf(main, list, now)).toEqual({ count: 2, largest: after2, spanHours: 24 });
  });
  it("is null for small events, events inside another sequence, lone mainshocks; handles null magnitudes", () => {
    expect(sequenceOf(after1, list, now)).toBeNull();
    expect(sequenceOf(event({ mag: null }), list, now)).toBeNull();
    const lone = event({
      id: "lone",
      mag: 7,
      time: "2026-10-10T00:00:00Z",
      latitude: -40,
      longitude: -40,
    });
    const n1 = event({
      id: "n1",
      mag: null,
      time: "2026-10-10T01:00:00Z",
      latitude: -40,
      longitude: -40,
    });
    const n2 = event({
      id: "n2",
      mag: 4.6,
      time: "2026-10-10T02:00:00Z",
      latitude: -40,
      longitude: -40,
    });
    expect(sequenceOf(lone, [lone, n1, n2], now)).toMatchObject({
      count: 2,
      largest: { id: "n2" },
    });
    expect(sequenceOf(lone, [lone, n1], now)).toMatchObject({ count: 1, largest: { id: "n1" } });
    expect(sequenceOf(lone, [lone], now)).toBeNull();
  });
  it("finds the parent mainshock", () => {
    expect(parentOf(after1, list)).toBe(main);
    expect(parentOf(far, list)).toBeNull();
    expect(parentOf(before, list)).toBeNull();
  });
});
