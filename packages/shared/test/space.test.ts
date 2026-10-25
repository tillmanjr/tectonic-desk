import { describe, expect, it } from "vitest";
import { isSpaceSeries, SPACE_SERIES } from "../src/index.js";

describe("space series", () => {
  it("names eleven series and recognises them", () => {
    expect(SPACE_SERIES).toHaveLength(11);
    expect(isSpaceSeries("kp_1m")).toBe(true);
    expect(isSpaceSeries("p100")).toBe(true);
    expect(isSpaceSeries("f107")).toBe(false);
  });
});
