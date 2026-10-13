import { mount } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import MapBasemap from "../../src/components/MapBasemap.vue";
import { frameFor, worldBasemap } from "../../src/lib/geo.js";
import { GLOBAL, squareTopology, WC } from "../support/events.js";

describe("MapBasemap", () => {
  it("draws the sphere, graticule, land and borders for the global view", () => {
    const frame = frameFor(GLOBAL);
    const w = mount(MapBasemap, {
      props: { frame, path: geoPath(frame.projection), basemap: worldBasemap(squareTopology) },
    });
    expect(w.findAll("path")).toHaveLength(4);
    expect(w.find("rect").exists()).toBe(false);
  });
  it("draws an ocean rect, a 2° graticule and dashed states for a region, and only the rect and graticule without a basemap", () => {
    const frame = frameFor(WC);
    const w = mount(MapBasemap, {
      props: { frame, path: geoPath(frame.projection), basemap: worldBasemap(squareTopology) },
    });
    expect(w.find("rect").exists()).toBe(true);
    expect(w.findAll("path").at(-1)?.attributes("stroke-dasharray")).toBe("3 2");
    const bare = mount(MapBasemap, {
      props: { frame, path: geoPath(frame.projection), basemap: null },
    });
    expect(bare.findAll("path")).toHaveLength(1);
  });
});
