import { describe, expect, it } from "vitest";
import {
  bValue,
  hasSolution,
  magnitudeBins,
  majorEvents,
  majorLabel,
  preferredMechanism,
  summary,
} from "../../src/lib/stats.js";
import { event, GLOBAL, mech, WC } from "../support/events.js";

const now = new Date("2026-10-13T00:00:00Z");
const bare = () =>
  mech({
    id: 4,
    strike1: null,
    dip1: null,
    rake1: null,
    strike2: null,
    dip2: null,
    rake2: null,
    tAzimuth: null,
  });

describe("bValue", () => {
  it("estimates b and its uncertainty", () => {
    const r = bValue([4.5, 4.5, 4.6, 4.7, 4.8, 5.0, 5.3, 6.1, 4.4], 4.5);
    expect(r).not.toBeNull();
    expect(r?.n).toBe(8);
    expect(r?.b).toBeCloseTo(0.89, 2);
    expect(r?.sigma).toBeGreaterThan(0);
  });
  it("is null with fewer than two magnitudes", () => {
    expect(bValue([4.5], 4.5)).toBeNull();
  });
});

describe("magnitudeBins", () => {
  it("builds 0.1 bins with cumulative and incremental counts", () => {
    const bins = magnitudeBins([4.5, 4.5, 4.7, 5.0], 4.5);
    expect(bins.map((b) => b.m)).toEqual([4.5, 4.6, 4.7, 4.8, 4.9, 5.0]);
    expect(bins.map((b) => b.cumulative)).toEqual([4, 2, 2, 1, 1, 1]);
    expect(bins.map((b) => b.incremental)).toEqual([2, 0, 1, 0, 0, 1]);
    expect(magnitudeBins([], 4.5)).toEqual([]);
  });
});

describe("summary", () => {
  it("counts, finds the largest and deepest, and counts solutions", () => {
    const a = event({
      id: "a",
      mag: 6.2,
      depthKm: 10,
      time: "2026-10-12T23:00:00Z",
      mechanisms: [mech()],
    });
    const b = event({ id: "b", mag: 4.6, depthKm: 500, time: "2026-10-10T00:00:00Z" });
    const c = event({
      id: "c",
      mag: null,
      depthKm: null,
      time: "2026-10-12T12:00:00Z",
      mechanisms: [bare()],
    });
    const d = event({ id: "d", mag: 4.6, depthKm: 20, time: "2026-10-10T00:00:00Z" });
    expect(summary([a, b, c, d], now)).toEqual({
      count: 4,
      last24h: 2,
      largest: a,
      deepest: b,
      withSolution: 1,
    });
    expect(summary([], now)).toEqual({
      count: 0,
      last24h: 0,
      largest: null,
      deepest: null,
      withSolution: 0,
    });
  });
});

describe("majorEvents", () => {
  const e6 = event({ id: "e6", mag: 6.1 });
  const alert = event({ id: "al", mag: 5.0, alert: "green" });
  const small = event({ id: "s", mag: 4.6 });
  it("global: M6+ or a PAGER alert, by magnitude", () => {
    expect(majorEvents([small, alert, e6], GLOBAL).map((e) => e.id)).toEqual(["e6", "al"]);
    expect(majorLabel(GLOBAL)).toBe("Major events · M6+ or a PAGER alert");
  });
  it("regional: the four largest", () => {
    const list = [2.6, 3.1, 4.2, 2.9, 3.8, null].map((mag, i) => event({ id: String(i), mag }));
    expect(majorEvents(list, WC).map((e) => e.mag)).toEqual([4.2, 3.8, 3.1, 2.9]);
    expect(majorLabel(WC)).toBe("Largest events in the region");
  });
});

describe("preferredMechanism / hasSolution", () => {
  it("prefers a drawable preferred mt, then fm, then any drawable", () => {
    const fm = mech({ kind: "fm", id: 2 });
    const mt = mech({ id: 3 });
    const notPreferred = mech({ id: 5, preferred: false });
    expect(preferredMechanism(event({ mechanisms: [fm, mt] }))).toBe(mt);
    expect(preferredMechanism(event({ mechanisms: [bare(), fm] }))).toBe(fm);
    expect(preferredMechanism(event({ mechanisms: [bare(), notPreferred] }))).toBe(notPreferred);
    expect(preferredMechanism(event({ mechanisms: [bare()] }))).toBeNull();
    expect(hasSolution(event({ mechanisms: [bare()] }))).toBe(false);
    expect(hasSolution(event({ mechanisms: [fm] }))).toBe(true);
  });
});
