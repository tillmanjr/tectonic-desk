import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AuroraMap from "../../src/components/AuroraMap.vue";
import { auroraBands } from "../../src/lib/aurora-bands.js";
import { worldBasemap } from "../../src/lib/geo.js";
import { ringGrid } from "../support/aurora.js";
import { squareTopology } from "../support/events.js";
import { SPACE_NOW } from "../support/space.js";

describe("AuroraMap", () => {
  it("draws land, graticule, night, five bands and the local-time marks, noon up", () => {
    const bands = auroraBands(ringGrid());
    const land = worldBasemap(squareTopology).land;
    const w = mount(AuroraMap, {
      props: { hemisphere: "north", bands, forecast: SPACE_NOW, land },
    });
    const svg = w.find("svg.polar.north");
    expect(svg.attributes("viewBox")).toBe("0 0 400 400");
    expect(svg.attributes("aria-label")).toBe("Northern hemisphere aurora probability");
    expect(w.find(".sphere").attributes("d")).toMatch(/^M/);
    expect(w.find(".land").exists()).toBe(true);
    expect(w.find(".grat").attributes("d")).toMatch(/^M/);
    expect(w.find(".night").attributes("d")).toMatch(/^M/);
    const paths = w.findAll(".band");
    expect(paths.map((p) => p.classes().at(-1))).toEqual([
      "au-10",
      "au-30",
      "au-50",
      "au-70",
      "au-90",
    ]);
    expect(paths[0]?.attributes("d")).toMatch(/^M/);
    expect(w.find(".htitle").text()).toBe("North");
    const marks = w.findAll(".tmark");
    expect(marks.map((m) => m.text())).toEqual(["12", "00", "06", "18"]);
    expect(Number(marks[0]?.attributes("y"))).toBeLessThan(20);
    expect(Number(marks[2]?.attributes("x"))).toBeGreaterThan(300);
    w.unmount();
  });

  it("flips morning to the left on the south view and draws without land or bands", () => {
    const w = mount(AuroraMap, {
      props: { hemisphere: "south", bands: [], forecast: SPACE_NOW, land: null },
    });
    expect(w.find("svg.polar.south").exists()).toBe(true);
    expect(w.find(".land").exists()).toBe(false);
    expect(w.findAll(".band")).toHaveLength(0);
    expect(w.find(".htitle").text()).toBe("South");
    const marks = w.findAll(".tmark");
    expect(Number(marks[2]?.attributes("x"))).toBeLessThan(100);
    w.unmount();
  });
});
