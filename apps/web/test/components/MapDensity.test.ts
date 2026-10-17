import { mount } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import MapDensity from "../../src/components/MapDensity.vue";
import { frameFor } from "../../src/lib/geo.js";
import { RAISED_GRID } from "../support/api.js";
import { GLOBAL } from "../support/events.js";

describe("MapDensity", () => {
  it("draws one path per cell, darker where the count is higher, and skips cells that do not project", () => {
    const path = geoPath(frameFor(GLOBAL).projection);
    const w = mount(MapDensity, { props: { path, grid: RAISED_GRID } });
    const paths = w.findAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]?.attributes("d")).toMatch(/^M/);
    const op = (i: number) => Number(paths[i]?.attributes("fill-opacity"));
    expect(op(0)).toBeGreaterThan(op(1));
    expect(w.find("g.density").attributes("style")).toContain("pointer-events: none");
    const blind = mount(MapDensity, { props: { path: () => null, grid: RAISED_GRID } });
    expect(blind.findAll("path")).toHaveLength(0);
  });
});
