import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChartAxes from "../../src/components/ChartAxes.vue";

const props = {
  xTicks: [
    { pos: 10, label: "a" },
    { pos: 90, label: "b" },
  ],
  yTicks: [{ pos: 20, label: "1" }],
  width: 100,
  height: 50,
  margin: { l: 10, r: 10, t: 5, b: 10 },
};

describe("ChartAxes", () => {
  it("renders grid lines, tick marks and labels", () => {
    const w = mount(ChartAxes, { props });
    expect(w.findAll(".gridl line")).toHaveLength(1);
    expect(w.findAll(".axis text").map((t) => t.text())).toEqual(["a", "b", "1"]);
  });
  it("omits the grid when asked", () => {
    expect(
      mount(ChartAxes, { props: { ...props, grid: false } })
        .find(".gridl")
        .exists(),
    ).toBe(false);
  });
});
