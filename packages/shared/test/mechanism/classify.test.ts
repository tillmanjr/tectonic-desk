import { describe, expect, it } from "vitest";
import { faultingStyle, strikeSlipSense } from "../../src/index.js";

describe("faultingStyle", () => {
  it.each([
    [{ strike: 0, dip: 30, rake: 90 }, "Thrust"],
    [{ strike: 0, dip: 60, rake: 90 }, "Reverse"],
    [{ strike: 0, dip: 60, rake: -90 }, "Normal"],
    [{ strike: 0, dip: 90, rake: 0 }, "Strike-slip"],
    [{ strike: 0, dip: 90, rake: 180 }, "Strike-slip"],
    [{ strike: 0, dip: 30, rake: 45 }, "Oblique Reverse"],
    [{ strike: 0, dip: 60, rake: -135 }, "Oblique Normal"],
    [{ strike: 0, dip: 80, rake: 155 }, "Oblique Strike-slip"],
    [{ strike: 0, dip: 80, rake: -25 }, "Oblique Strike-slip"],
  ])("%o is %s", (plane, style) => {
    expect(faultingStyle(plane)).toBe(style);
  });
});

describe("strikeSlipSense", () => {
  it("is left-lateral for |rake| < 90 and right-lateral otherwise", () => {
    expect(strikeSlipSense({ strike: 0, dip: 90, rake: 10 })).toBe("left-lateral");
    expect(strikeSlipSense({ strike: 0, dip: 90, rake: -170 })).toBe("right-lateral");
  });
});
