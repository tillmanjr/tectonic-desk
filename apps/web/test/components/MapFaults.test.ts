import { mount } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import MapFaults from "../../src/components/MapFaults.vue";
import { faultFeatures } from "../../src/lib/faults.js";
import { frameFor } from "../../src/lib/geo.js";
import { WC } from "../support/events.js";
import { faultsTopology } from "../support/faults.js";

describe("MapFaults", () => {
  it("draws one path per age and certainty class and the hovered trace on top", async () => {
    const features = faultFeatures(faultsTopology);
    const path = geoPath(frameFor(WC).projection);
    const w = mount(MapFaults, { props: { path, features, hovered: null } });
    const paths = w.findAll("path.qf");
    expect(paths).toHaveLength(3);
    expect(paths[0]?.attributes("style")).toContain("var(--qf-hist)");
    expect(paths[0]?.attributes("stroke-dasharray")).toBeUndefined();
    expect(paths[1]?.attributes("stroke-dasharray")).toBe("5 3");
    expect(paths[2]?.attributes("style")).toContain("var(--qf-other)");
    expect(paths[0]?.attributes("d")).toMatch(/^M/);
    expect(w.find("path.hot").exists()).toBe(false);
    await w.setProps({ hovered: features[1] ?? null });
    expect(w.find("path.hot").attributes("d")).toBe(paths[1]?.attributes("d"));
  });
  it("folds several features of one class into one path", () => {
    const features = faultFeatures(faultsTopology);
    const twice = [...features, ...features];
    const path = geoPath(frameFor(WC).projection);
    const w = mount(MapFaults, { props: { path, features: twice, hovered: null } });
    expect(w.findAll("path.qf")).toHaveLength(3);
    expect(w.findAll("path.qf")[0]?.attributes("d")?.match(/M/g)).toHaveLength(2);
  });
});
