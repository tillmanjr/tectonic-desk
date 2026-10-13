import { scaleLinear, scaleLog, scaleUtc } from "d3-scale";
import { describe, expect, it } from "vitest";
import { stepPath, ticksOf } from "../../src/lib/charts.js";

describe("ticksOf", () => {
  it("positions and labels ticks for linear, log and time scales", () => {
    const lin = ticksOf(scaleLinear().domain([0, 10]).range([0, 100]), 2);
    expect(lin).toEqual([
      { pos: 0, label: "0" },
      { pos: 50, label: "5" },
      { pos: 100, label: "10" },
    ]);
    const log = ticksOf(scaleLog().domain([1, 100]).range([0, 100]), 2, "~s");
    expect(log[0]).toEqual({ pos: 0, label: "1" });
    const time = ticksOf(
      scaleUtc()
        .domain([new Date("2026-10-01T00:00:00Z"), new Date("2026-10-03T00:00:00Z")])
        .range([0, 200]),
      2,
      "%b %-d",
    );
    expect(time.map((t) => t.label)).toEqual(["Oct 1", "Oct 2", "Oct 3"]);
  });
});

describe("stepPath", () => {
  it("draws a step-after path and nothing for no points", () => {
    expect(
      stepPath([
        { x: 0, y: 10 },
        { x: 5, y: 20 },
        { x: 9, y: 30 },
      ]),
    ).toBe("M0,10H5V20H9V30");
    expect(stepPath([])).toBe("");
  });
});
