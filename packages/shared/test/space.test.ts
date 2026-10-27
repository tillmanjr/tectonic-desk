import { describe, expect, it } from "vitest";
import {
  AURORA_CELLS,
  auroraIndex,
  isSpaceSeries,
  mapSeries,
  SERIES_AGGREGATE,
  seriesRecord,
  SPACE_SERIES,
} from "../src/index.js";

describe("space series", () => {
  it("names seventeen series and recognises them", () => {
    expect(SPACE_SERIES).toHaveLength(17);
    expect(isSpaceSeries("kp_1m")).toBe(true);
    expect(isSpaceSeries("p100")).toBe(true);
    expect(isSpaceSeries("f107")).toBe(true);
    expect(isSpaceSeries("kp")).toBe(false);
  });

  it("names the aggregate of every series", () => {
    expect(SERIES_AGGREGATE.kp_gfz).toBe("max");
    expect(SERIES_AGGREGATE.xray_long).toBe("max");
    expect(SERIES_AGGREGATE.dst).toBe("min");
    expect(SERIES_AGGREGATE.bz_gsm).toBe("min");
    expect(SERIES_AGGREGATE.f107).toBe("mean");
    expect(Object.keys(SERIES_AGGREGATE)).toEqual([...SPACE_SERIES]);
  });

  it("builds and maps a record over every series", () => {
    const lengths = seriesRecord((s) => s.length);
    expect(Object.keys(lengths)).toEqual([...SPACE_SERIES]);
    expect(lengths.kp_1m).toBe(5);
    const doubled = mapSeries(lengths, (n, s) => `${s}:${String(n * 2)}`);
    expect(doubled.p100).toBe("p100:8");
  });

  it("indexes the aurora grid longitude-major", () => {
    expect(auroraIndex(0, -90)).toBe(0);
    expect(auroraIndex(0, 90)).toBe(180);
    expect(auroraIndex(1, -90)).toBe(181);
    expect(auroraIndex(359, 90)).toBe(AURORA_CELLS - 1);
    expect(AURORA_CELLS).toBe(65_160);
  });
});
