import { mount } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import MapPlates from "../../src/components/MapPlates.vue";
import { frameFor, plateFeature, type PlateSegment } from "../../src/lib/geo.js";
import { GLOBAL, plateSegments } from "../support/events.js";

describe("MapPlates", () => {
  it("emits hover with the title while the pointer moves along a hit stroke, and leave", async () => {
    const path = geoPath(frameFor(GLOBAL).projection);
    const features = (plateSegments as PlateSegment[]).map(plateFeature);
    const w = mount(MapPlates, { props: { path, features } });
    await w.findAll("path.hit")[3]?.trigger("mousemove", { clientX: 12, clientY: 34 });
    expect(w.emitted("hover")?.[0]?.[0]).toMatchObject({
      index: 3,
      title:
        "Subduction · NA/JF · 35 mm/yr relative (PB2002) · Juan de Fuca subducts under North America",
      x: 12,
      y: 34,
    });
    expect(w.findAll("path.line")[3]?.classes()).toContain("hot");
    expect(Number(w.findAll("path.line")[3]?.attributes("stroke-width"))).toBeCloseTo(3.4, 6);
    expect(w.findAll("path.line")[2]?.classes()).not.toContain("hot");
    await w.findAll("path.hit")[3]?.trigger("mouseleave");
    expect(w.emitted("leave")).toHaveLength(1);
    expect(w.findAll("path.line.hot")).toHaveLength(0);
  });
  it("draws one path per segment with class styling", () => {
    const path = geoPath(frameFor(GLOBAL).projection);
    const features = (plateSegments as PlateSegment[]).map(plateFeature);
    const w = mount(MapPlates, { props: { path, features } });
    const paths = w.findAll("path.line");
    expect(paths).toHaveLength(4);
    expect(paths[0]?.attributes("stroke-dasharray")).toBe("6 3");
    expect(paths[2]?.attributes("stroke-dasharray")).toBeUndefined();
    expect(paths[2]?.attributes("stroke-width")).toBe("2.2");
    const hits = w.findAll("path.hit");
    expect(hits).toHaveLength(4);
    expect(hits[2]?.attributes("stroke-width")).toBe("10");
  });
});
