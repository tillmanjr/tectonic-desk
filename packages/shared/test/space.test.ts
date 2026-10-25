import { describe, expect, it } from "vitest";
import { isSpaceSeries, mapSeries, seriesRecord, SPACE_SERIES } from "../src/index.js";

describe("space series", () => {
  it("names eleven series and recognises them", () => {
    expect(SPACE_SERIES).toHaveLength(11);
    expect(isSpaceSeries("kp_1m")).toBe(true);
    expect(isSpaceSeries("p100")).toBe(true);
    expect(isSpaceSeries("f107")).toBe(false);
  });

  it("builds and maps a record over every series", () => {
    const lengths = seriesRecord((s) => s.length);
    expect(Object.keys(lengths)).toEqual([...SPACE_SERIES]);
    expect(lengths.kp_1m).toBe(5);
    const doubled = mapSeries(lengths, (n, s) => `${s}:${String(n * 2)}`);
    expect(doubled.p100).toBe("p100:8");
  });
});
