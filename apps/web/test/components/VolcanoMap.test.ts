import { flushPromises, mount } from "@vue/test-utils";
import type { GeoProjection } from "d3-geo";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapVolcanoes from "../../src/components/MapVolcanoes.vue";
import VolcanoMap from "../../src/components/VolcanoMap.vue";
import { frameFor } from "../../src/lib/geo.js";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { GLOBAL } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { status, VOLCANOES } from "../support/volcanoes.js";
import { stubWorld } from "../support/world.js";

describe("MapVolcanoes", () => {
  it("draws a triangle per volcano, rings ranked ones in their aviation colour, and marks continuing eruptions", async () => {
    const ringColors = new Map([
      [332010, "var(--av-orange)"],
      [241040, "var(--av-yellow)"],
    ]);
    const w = mount(MapVolcanoes, {
      props: {
        frame: frameFor(GLOBAL),
        volcanoes: VOLCANOES,
        k: 1,
        selected: 332010,
        ringOf: (n: number) => ringColors.get(n) ?? null,
        continuing: new Set([211060]),
      },
    });
    const groups = w.findAll("g.volc");
    expect(groups).toHaveLength(5);
    const kil = groups.find((g) => g.attributes("data-number") === "332010");
    expect(kil?.classes()).toContain("sel");
    const rings = w.findAll("circle.ring");
    expect(rings).toHaveLength(2);
    expect(kil?.find("circle.ring").attributes("style")).toContain("var(--av-orange)");
    expect(w.findAll("circle.plume")).toHaveLength(1);
    const first = groups[0];
    await first?.trigger("mouseenter", { clientX: 5, clientY: 6 });
    expect(w.emitted("hover")?.[0]?.[0]).toMatchObject({ x: 5, y: 6 });
    await first?.trigger("mouseleave");
    expect(w.emitted("leave")).toHaveLength(1);
    await kil?.trigger("click");
    expect(w.emitted("select")?.[0]).toEqual([332010]);
    const d = groups[0]?.find("path").attributes("d") ?? "";
    await w.setProps({ minRadius: 40, k: 2 });
    expect(groups[0]?.find("path").attributes("d")).not.toBe(d);
    const nowhere = { ...frameFor(GLOBAL), projection: (() => null) as unknown as GeoProjection };
    await w.setProps({ frame: nowhere });
    expect(w.findAll("g.volc")).toHaveLength(0);
  });
});

describe("VolcanoMap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("shows the volcanoes with tooltips, no earthquake layer, and zooms to a selection", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext({ volcanoes: true });
    // A second, lower status for Kilauea: the ring and tooltip follow the higher one.
    ctx.volcanoes.statuses.value = [
      ...ctx.volcanoes.statuses.value,
      status({ id: 10, level: "ADVISORY", color: "YELLOW" }),
    ];
    const w = mountWith(VolcanoMap, ctx, { animate: false });
    await flushPromises();
    expect(w.find(".mapcount").text()).toBe("Showing 5 of 5 volcanoes");
    expect(w.findComponent({ name: "MapVolcanoes" }).findAll("g.volc")).toHaveLength(5);
    expect(w.findComponent({ name: "MapEvents" }).exists()).toBe(false);
    expect(w.findAll(".maptools label").some((l) => l.text().includes("earthquakes"))).toBe(false);
    expect(w.find(".legend").text()).not.toContain("0–70 km");
    expect(w.find(".legend").text()).not.toContain("Beachball");
    expect(w.find(".legend").text()).toContain("Erupted since 1950");
    const volc = w.findComponent({ name: "MapVolcanoes" }).findAll("g.volc");
    const etna = volc.find(
      (g) => g.attributes("class")?.includes("volc") && g.html().includes("plume"),
    );
    await etna?.trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toBe(
      "Etna · Stratovolcano · last erupted 2026 · eruption continuing (GVP)",
    );
    await etna?.trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    const kilauea = volc.find((g) => g.attributes("data-number") === "332010");
    await kilauea?.trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toContain("USGS Watch · Orange");
    expect(kilauea?.find("circle.ring").attributes("style")).toContain("var(--av-orange)");
    const helens = volc.find((g) => g.attributes("data-number") === "321050");
    await helens?.trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toBe("St. Helens · Stratovolcano · last erupted 2008");
    expect(helens?.find("circle.ring").exists()).toBe(false);
    await kilauea?.trigger("click");
    expect(ctx.selectVolcano).toHaveBeenCalledWith(332010);
    ctx.volcanoes.select(332010);
    await flushPromises();
    expect(w.find("svg.map > g").attributes("transform")).toContain("scale(");
    await ctx.catalog.setRegion("wc");
    ctx.volcanoes.setRegion(ctx.catalog.region.value);
    await flushPromises();
    expect(w.findComponent({ name: "MapEvents" }).exists()).toBe(false);
    expect(w.find(".mapcount").text()).toBe("Showing 2 of 2 volcanoes");
    w.unmount();
  });
});
