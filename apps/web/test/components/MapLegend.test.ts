import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapLegend from "../../src/components/MapLegend.vue";
import { frameFor } from "../../src/lib/geo.js";
import { GLOBAL, WC } from "../support/events.js";
import { raster } from "../support/fields.js";

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
    expect(r.text()).not.toContain("Historic (<150 yr)");
    const f = mount(MapLegend, {
      props: { frame: frameFor(WC), minMag: 2.5, faults: ["historic", "other"] },
    });
    expect(f.text()).toContain("Historic (<150 yr)");
    expect(f.text()).toContain("Age unspecified or Class B");
    expect(f.text()).not.toContain("Latest Quaternary");
    expect(f.text()).toContain("dotted = inferred");
    expect(f.findAll("line")).toHaveLength(r.findAll("line").length + 2);
    const v = mount(MapLegend, { props: { frame: frameFor(WC), minMag: 2.5, quakes: false } });
    expect(v.text()).not.toContain("0–70 km");
    expect(v.text()).not.toContain("M4.5");
    expect(v.text()).not.toContain("shaded = compressional");
    expect(v.text()).toContain("Subduction");
  });
  it("adds the aurora row with its time, while loading, or with an error", () => {
    const at = (aurora: { time: string | null; error: string | null }) =>
      mount(MapLegend, { props: { frame: frameFor(GLOBAL), minMag: 4.5, aurora } });
    const w = at({ time: "13:05 UTC", error: null });
    const row = w.find(".aurorarow");
    expect(row.findAll("i").map((i) => i.classes()[0])).toEqual([
      "au-10",
      "au-30",
      "au-50",
      "au-70",
      "au-90",
    ]);
    expect(row.text()).toContain("90%");
    expect(row.text()).toContain("chance of aurora at 13:05 UTC");
    expect(at({ time: null, error: null }).find(".aurorarow").text()).toContain(
      "chance of aurora · loading",
    );
    expect(at({ time: null, error: "HTTP 503" }).find(".aurorarow").text()).toContain(
      "chance of aurora · HTTP 503",
    );
    const none = mount(MapLegend, { props: { frame: frameFor(GLOBAL), minMag: 4.5 } });
    expect(none.find(".aurorarow").exists()).toBe(false);
  });
  it("adds a density row when given one", () => {
    const w = mount(MapLegend, {
      props: { frame: frameFor(GLOBAL), minMag: 4.5, density: { cell: 2, floor: 4.5, max: 5000 } },
    });
    expect(w.text()).toContain("events per 2° cell at M4.5+: 1 → 5,000 (log scale)");
    expect(w.findAll("rect")).toHaveLength(5);
  });
  it("steps the size key from a raised floor", () => {
    const w = mount(MapLegend, { props: { frame: frameFor(GLOBAL), minMag: 6 } });
    expect(w.text()).toContain("M6");
    expect(w.text()).toContain("M8");
    expect(w.text()).not.toContain("M4.5");
  });

  it("adds a ramp row for a field raster with its ticks and caption", () => {
    const w = mount(MapLegend, {
      props: { frame: frameFor(GLOBAL), minMag: 4.5, field: raster() },
    });
    const row = w.find(".fieldrow");
    expect(row.findAll("stop").map((s) => s.attributes("offset"))).toEqual([
      "0%",
      "25%",
      "50%",
      "75%",
      "100%",
    ]);
    expect(row.findAll("stop")[0]?.attributes("stop-color")).toBe("#2f5f9e");
    expect(row.find("rect").attributes("fill")).toBe("url(#fieldgrad-gravity-global)");
    expect(row.findAll(".ticks span").map((t) => t.text())).toEqual([
      "-120",
      "-60",
      "0",
      "60",
      "120",
    ]);
    expect(row.find(".fieldcap").text()).toBe("mGal · Free-air gravity anomaly · test");
    const e = mount(MapLegend, {
      props: {
        frame: frameFor(GLOBAL),
        minMag: 4.5,
        field: raster({ equalised: true, stops: [[5, "#000000"]], ticks: [5] }),
      },
    });
    expect(e.find(".fieldcap").text()).toContain("· equalised ramp");
    expect(e.find("stop").attributes("offset")).toBe("0%");
    const none = mount(MapLegend, { props: { frame: frameFor(GLOBAL), minMag: 4.5 } });
    expect(none.find(".fieldrow").exists()).toBe(false);
  });
});
