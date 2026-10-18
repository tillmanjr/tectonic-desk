import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import CombinedMap from "../../src/components/CombinedMap.vue";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { raisedApi } from "../support/api.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("CombinedMap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("draws volcanoes under earthquakes, joins both count lines, tips both, and hides either layer on request", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext({ volcanoes: true });
    const w = mountWith(CombinedMap, ctx, { animate: false });
    await flushPromises();
    expect(w.find("svg.map").attributes("aria-label")).toBe(
      "Map of earthquake epicenters and Holocene volcanoes",
    );
    expect(w.find(".mapcount").text()).toBe("Showing 1 of 1 events · 5 of 5 volcanoes");
    const layers = Array.from(w.find("svg.map > g").element.children).map((c) =>
      c.getAttribute("data-layer"),
    );
    expect(layers.indexOf("volcanoes")).toBeGreaterThan(-1);
    expect(layers.indexOf("volcanoes")).toBeLessThan(layers.indexOf("events"));
    await w.find("g.volc").trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toContain("Etna");
    await w.find("g.volc").trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    await w.find("[data-layer=events] circle").trigger("mouseenter", { clientX: 9, clientY: 9 });
    expect(w.find(".tip").text()).toMatch(/^M/);
    await w.find("[data-layer=events] circle").trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    await w.find("g.volc").trigger("click");
    expect(ctx.selectVolcano).toHaveBeenCalledWith(211060);
    await w.find("[data-layer=events] circle").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("us1");
    expect(w.text()).toContain("Beachball: shaded = compressional");
    expect(w.text()).toContain("ring: agency alert above normal");
    ctx.volcanoes.hideMarkers.value = true;
    await nextTick();
    expect(w.findComponent({ name: "MapVolcanoes" }).exists()).toBe(false);
    expect(w.find(".mapcount").text()).toBe("Showing 1 of 1 events · 5 of 5 volcanoes");
    ctx.catalog.hideMarkers.value = true;
    await nextTick();
    expect(w.findComponent({ name: "MapEvents" }).exists()).toBe(false);
    ctx.volcanoes.hideMarkers.value = false;
    ctx.catalog.hideMarkers.value = false;
    await nextTick();
    const animate = w.findAll(".zbtn").find((b) => b.text() === "Animate");
    await animate?.trigger("click");
    expect(w.find(".animcount").text()).toBe("0 of 1 events");
    expect(w.findAll("[data-layer=events] circle")).toHaveLength(0);
    expect(w.findAll("g.volc")).toHaveLength(5);
    await animate?.trigger("click");
    expect(w.find(".animbar").exists()).toBe(false);
    w.unmount();
  });

  it("offers density shading and the mechanism toggle on a raised window", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext({
      api: raisedApi(),
      volcanoes: true,
      range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
    });
    const w = mountWith(CombinedMap, ctx, { animate: false });
    await flushPromises();
    expect(w.find(".mapcount").text()).toBe(
      "Showing 1 of 7,312 events · markers at M6+ · 5 of 5 volcanoes",
    );
    const toggle = (name: string) =>
      w.findAll(".maptools label").find((l) => l.text().includes(name));
    expect(w.findComponent({ name: "MapDensity" }).exists()).toBe(false);
    await toggle("Density")?.find("input").setValue(true);
    expect(w.findComponent({ name: "MapDensity" }).exists()).toBe(true);
    expect(w.text()).toContain("events per 2° cell");
    await toggle("Focal mechanisms")?.find("input").setValue(false);
    expect(w.findComponent({ name: "MapEvents" }).props("showMech")).toBe(false);
    w.unmount();
  });
});
