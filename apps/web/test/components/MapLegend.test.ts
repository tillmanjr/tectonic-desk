import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapLegend from "../../src/components/MapLegend.vue";
import { frameFor } from "../../src/lib/geo.js";
import { GLOBAL, WC } from "../support/events.js";

describe("MapLegend", () => {
  it("lists depth classes, size samples, the beachball note and plate classes", () => {
    const g = mount(MapLegend, { props: { frame: frameFor(GLOBAL), minMag: 4.5 } });
    expect(g.text()).toContain("0–70 km");
    expect(g.text()).toContain("M7.5");
    expect(g.text()).toContain("shaded = compressional");
    expect(g.text()).toContain("Subduction");
    expect(g.findAll("path.teeth")).toHaveLength(1);
    expect(g.text()).toContain("Point at a boundary line");
    const r = mount(MapLegend, { props: { frame: frameFor(WC), minMag: 2.5 } });
    expect(r.text()).toContain("M4.5");
    expect(r.text()).not.toContain("M7.5");
  });
});
