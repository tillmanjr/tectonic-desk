import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MapAurora from "../../src/components/MapAurora.vue";
import { auroraBands } from "../../src/lib/aurora-bands.js";
import { frameFor } from "../../src/lib/geo.js";
import { ringGrid } from "../support/aurora.js";
import { GLOBAL } from "../support/events.js";

describe("MapAurora", () => {
  it("draws the night side and one path per band through the frame's path", () => {
    const path = geoPath(frameFor(GLOBAL).projection);
    const w = mount(MapAurora, {
      props: { path, bands: auroraBands(ringGrid()), forecast: "2026-10-13T12:00:00Z" },
    });
    expect(w.find("g.aurora").exists()).toBe(true);
    expect(w.find("path.night").attributes("d")).toMatch(/^M/);
    const bands = w.findAll("path.band");
    expect(bands.map((b) => b.classes()[1])).toEqual(["au-10", "au-30", "au-50", "au-70", "au-90"]);
    expect(bands.every((b) => (b.attributes("d") ?? "").startsWith("M"))).toBe(true);
    // the Sun moves with the forecast time, so the night path does
    const night = w.find("path.night").attributes("d");
    const later = mount(MapAurora, {
      props: { path, bands: [], forecast: "2026-10-13T18:00:00Z" },
    });
    expect(later.find("path.night").attributes("d")).not.toBe(night);
    expect(later.findAll("path.band")).toHaveLength(0);
  });
});
