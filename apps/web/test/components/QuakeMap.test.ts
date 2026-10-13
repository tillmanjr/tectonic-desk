import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuakeMap from "../../src/components/QuakeMap.vue";
import { createCatalog } from "../../src/lib/catalog.js";
import { fakeApi } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, squareTopology } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("QuakeMap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the world basemap and plates for the global view and zooms with the toolbar", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    expect(w.find("svg").attributes("viewBox")).toBe("0 0 1000 520");
    expect(w.findAll("svg > g > g").length).toBeGreaterThanOrEqual(3);
    expect(w.findComponent({ name: "MapPlates" }).findAll("path.line")).toHaveLength(4);
    expect(w.findComponent({ name: "MapTeeth" }).findAll("path")).toHaveLength(1);
    expect(w.findAll("g.bb")).toHaveLength(0);
    const buttons = w.findAll(".zbtn");
    await buttons[0]?.trigger("click");
    expect(w.find("svg > g").attributes("transform")).toContain("scale(1.8");
    await buttons[1]?.trigger("click");
    await buttons[2]?.trigger("click");
    expect(w.find("svg > g").attributes("transform")).toBe("translate(0,0) scale(1)");
    await w.findAll("input[type=checkbox]")[1]?.setValue(false);
    expect(w.findComponent({ name: "MapPlates" }).exists()).toBe(false);
    await w.findAll("input[type=checkbox]")[0]?.setValue(false);
    expect(w.findComponent({ name: "MapEvents" }).findAll("circle")).toHaveLength(1);
    await w.findAll("input[type=checkbox]")[2]?.setValue(false);
    expect(w.findComponent({ name: "MapTeeth" }).exists()).toBe(false);
  });

  it("zooms to the selected event and shows a tooltip on hover", async () => {
    stubWorld();
    stubCanvas();
    const bare = event({ id: "bare", mag: null, depthKm: null, magType: null, place: null });
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue({ events: [event(), bare], count: 2, truncated: false, query: {} }),
    });
    const ctx = await makeContext({ api });
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    ctx.catalog.select("us1");
    await flushPromises();
    expect(w.find("svg > g").attributes("transform")).toContain("scale(6)");
    const circles = w.findComponent({ name: "MapEvents" }).findAll("circle");
    await circles[1]?.trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toBe("M5.5 mww · 195 km · 122 km W of Neiafu, Tonga");
    await circles[1]?.trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    await circles[0]?.trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toBe("M— · — km · unknown location");
    await w.findAll("path.hit")[3]?.trigger("mousemove", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toContain("Juan de Fuca subducts under North America");
    await w.findAll("path.hit")[3]?.trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    ctx.catalog.select("missing");
    await flushPromises();
    expect(w.find("svg > g").attributes("transform")).toContain("scale(6)");
  });

  it("switches to the region basemap, resets the zoom, caches it, and logs basemap and plate failures", async () => {
    stubWorld(false);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = fakeApi();
    let resolveStates: (v: unknown) => void = () => undefined;
    vi.mocked(api.geo).mockImplementation((name: string) => {
      if (name === "plates") return Promise.reject(new Error("no plates"));
      if (name === "wc-states") {
        return new Promise((r) => {
          resolveStates = r;
        });
      }
      return Promise.resolve(squareTopology);
    });
    const ctx = await makeContext({ api });
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    expect(err).toHaveBeenCalledTimes(2);
    await w.findAll(".zbtn")[0]?.trigger("click");
    await ctx.catalog.setRegion("wc");
    await flushPromises();
    expect(w.find("svg").attributes("viewBox")).toBe("0 0 1000 700");
    expect(w.find("svg > g").attributes("transform")).toBe("translate(0,0) scale(1)");
    expect(api.geo).toHaveBeenCalledWith("wc-land");
    await ctx.catalog.setRegion("global");
    await flushPromises();
    resolveStates(squareTopology);
    await flushPromises();
    expect(w.find("rect").exists()).toBe(false);
    await ctx.catalog.setRegion("wc");
    await flushPromises();
    expect(w.find("rect").exists()).toBe(true);
    expect(w.findComponent({ name: "MapBasemap" }).findAll("path").length).toBe(3);
    expect(vi.mocked(api.geo).mock.calls.filter((c) => c[0] === "wc-land")).toHaveLength(1);
  });

  it("uses animated transitions by default and throws without a region", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx);
    await flushPromises();
    await w.findAll(".zbtn")[0]?.trigger("click");
    await w.findAll(".zbtn")[2]?.trigger("click");
    expect(w.find("svg").exists()).toBe(true);
    const empty = createCatalog(fakeApi(), () => ctx.now);
    expect(() => mountWith(QuakeMap, { ...ctx, catalog: empty })).toThrow("no region selected");
  });
});
