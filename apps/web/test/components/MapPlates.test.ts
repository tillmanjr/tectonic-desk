import { mount } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import MapPlates from "../../src/components/MapPlates.vue";
import { frameFor, plateFeature, type PlateSegment } from "../../src/lib/geo.js";
import { GLOBAL, plateSegments } from "../support/events.js";

describe("MapPlates", () => {
  it("draws one path per segment with class styling and a title", () => {
    const path = geoPath(frameFor(GLOBAL).projection);
    const features = (plateSegments as PlateSegment[]).map(plateFeature);
    const w = mount(MapPlates, { props: { path, features } });
    const paths = w.findAll("path");
    expect(paths).toHaveLength(4);
    expect(paths[0]?.attributes("stroke-dasharray")).toBe("6 3");
    expect(paths[2]?.attributes("stroke-dasharray")).toBeUndefined();
    expect(paths[2]?.attributes("stroke-width")).toBe("2.2");
    expect(paths[2]?.find("title").text()).toContain("Subduction · PA-NA");
  });
});
