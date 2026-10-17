import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import QuakeMap from "../../src/components/QuakeMap.vue";
import { createCatalog } from "../../src/lib/catalog.js";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { frameFor } from "../../src/lib/geo.js";
import { fakeApi, raisedApi } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, plateSegments, squareTopology, WC } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("QuakeMap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("loads the world basemap and plates for the global view and zooms with the toolbar", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    expect(w.find("svg.map").attributes("viewBox")).toBe("0 0 1000 520");
    expect(w.findAll("svg.map > g > g").length).toBeGreaterThanOrEqual(3);
    expect(w.findComponent({ name: "MapPlates" }).findAll("path.line")).toHaveLength(4);
    expect(w.findComponent({ name: "MapTeeth" }).findAll("path")).toHaveLength(1);
    expect(w.findAll("g.bb")).toHaveLength(0);
    const buttons = w.findAll(".zbtn");
    await buttons[0]?.trigger("click");
    expect(w.find("svg.map > g").attributes("transform")).toContain("scale(1.8");
    await buttons[1]?.trigger("click");
    await buttons[2]?.trigger("click");
    expect(w.find("svg.map > g").attributes("transform")).toBe("translate(0,0) scale(1)");
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
    expect(w.find("svg.map > g").attributes("transform")).toContain("scale(6)");
    const circles = w.findComponent({ name: "MapEvents" }).findAll("circle");
    await circles[1]?.trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toBe(
      "M5.5 mww · 195 km · 122 km W of Neiafu, Tonga · Oct 12, 04:38 UTC",
    );
    await circles[1]?.trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    await circles[0]?.trigger("mouseenter", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toBe("M— · — km · unknown location · Oct 12, 04:38 UTC");
    await w.findAll("path.hit")[3]?.trigger("mousemove", { clientX: 40, clientY: 50 });
    expect(w.find(".tip").text()).toContain("Juan de Fuca subducts under North America");
    expect(w.find(".tip").attributes("style")).toContain("top: 40px");
    expect(w.findComponent({ name: "MapTeeth" }).find("path.hot").exists()).toBe(true);
    await w.findAll("path.hit")[3]?.trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    expect(w.findComponent({ name: "MapTeeth" }).find("path.hot").exists()).toBe(false);
    ctx.catalog.select("missing");
    await flushPromises();
    expect(w.find("svg.map > g").attributes("transform")).toContain("scale(6)");
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
    expect(w.find("svg.map").attributes("viewBox")).toBe("0 0 1000 700");
    expect(w.find("svg.map > g").attributes("transform")).toBe("translate(0,0) scale(1)");
    expect(api.geo).toHaveBeenCalledWith("wc-land");
    await ctx.catalog.setRegion("global");
    await flushPromises();
    resolveStates(squareTopology);
    await flushPromises();
    expect(w.findComponent({ name: "MapBasemap" }).find("rect").exists()).toBe(false);
    await ctx.catalog.setRegion("wc");
    await flushPromises();
    expect(w.findComponent({ name: "MapBasemap" }).find("rect").exists()).toBe(true);
    expect(w.findComponent({ name: "MapBasemap" }).findAll("path").length).toBe(3);
    expect(vi.mocked(api.geo).mock.calls.filter((c) => c[0] === "wc-land")).toHaveLength(1);
  });

  it("starts free for a mouse, zooms with the wheel, and ignores it once locked", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    const svg = w.find("svg.map");
    // happy-dom's SVGPoint lacks matrixTransform; d3 then falls back to getBoundingClientRect.
    Object.defineProperty(svg.element, "createSVGPoint", { value: undefined });
    expect(svg.classes()).not.toContain("locked");
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("false");
    expect(w.find(".maplock .slash").exists()).toBe(false);
    await svg.trigger("wheel", { deltaY: -100, clientX: 10, clientY: 10 });
    expect(w.find("svg.map > g").attributes("transform")).not.toBe("translate(0,0) scale(1)");
    await w.findAll(".zbtn")[2]?.trigger("click");
    expect(w.find("svg.map > g").attributes("transform")).toBe("translate(0,0) scale(1)");
    await w.find(".maplock").trigger("click");
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("true");
    expect(w.find(".maplock .slash").exists()).toBe(true);
    expect(svg.classes()).toContain("locked");
    await svg.trigger("wheel", { deltaY: -100, clientX: 10, clientY: 10 });
    expect(w.find("svg.map > g").attributes("transform")).toBe("translate(0,0) scale(1)");
    await w.findAll(".zbtn")[0]?.trigger("click");
    expect(w.find("svg.map > g").attributes("transform")).toContain("scale(1.8");
  });

  it("replays the window day by day, showing only events that have happened", async () => {
    stubWorld();
    stubCanvas();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    const markers = () => w.findComponent({ name: "MapEvents" }).findAll("circle, g.bb").length;
    expect(markers()).toBe(1);
    const animate = w.findAll(".zbtn").find((b) => b.text() === "Animate");
    await animate?.trigger("click");
    expect(w.find(".animbar").exists()).toBe(true);
    expect(w.find(".animclock").text()).toBe("2026-10-05 00:00 UTC");
    expect(w.find(".animcount").text()).toBe("0 of 1 events");
    expect(markers()).toBe(0);
    await w.find(".animbar input").setValue("1");
    await w.find(".animbar .play").trigger("click");
    expect(w.find(".animbar .play").text()).toBe("Pause");
    await vi.advanceTimersByTimeAsync(7200);
    expect(w.find(".animclock").text()).toBe("2026-10-12 04:48 UTC");
    expect(markers()).toBe(1);
    await w.find(".animbar .play").trigger("click");
    expect(w.find(".animbar .play").text()).toBe("Start");
    await w.find("[aria-label='Back one day']").trigger("click");
    expect(w.find(".animclock").text()).toBe("2026-10-11 04:48 UTC");
    expect(markers()).toBe(0);
    await w.find("[aria-label='Forward one day']").trigger("click");
    expect(markers()).toBe(1);
    const close = w.findAll(".animbar .zbtn").find((b) => b.text() === "Close");
    await close?.trigger("click");
    expect(w.find(".animbar").exists()).toBe(false);
    expect(markers()).toBe(1);
    await animate?.trigger("click");
    expect(w.find(".animbar").exists()).toBe(true);
    await animate?.trigger("click");
    expect(w.find(".animbar").exists()).toBe(false);
    w.unmount();
    vi.useRealTimers();
  });

  it("opens the animation over a date range when one is set", async () => {
    stubWorld();
    const ctx = await makeContext();
    ctx.catalog.setRange({ since: "2026-10-09T00:00:00.000Z", until: "2026-10-10T23:59:59.999Z" });
    await flushPromises();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    const animate = w.findAll(".zbtn").find((b) => b.text() === "Animate");
    await animate?.trigger("click");
    expect(w.find(".animclock").text()).toBe("2026-10-08 00:00 UTC");
    expect(w.find(".mapcount").text()).toBe("Showing 1 of 1 events");
    w.unmount();
  });

  it("shades density under the markers when the floor was raised, with a toggle and legend row", async () => {
    stubWorld();
    const ctx = await makeContext({
      api: raisedApi(),
      range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
    });
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    expect(w.find(".mapcount").text()).toBe("Showing 1 of 7,312 events · markers at M6+");
    expect(w.findComponent({ name: "MapDensity" }).findAll("path")).toHaveLength(2);
    expect(w.text()).toContain("events per 2° cell at M4.5+: 1 → 5,000 (log scale)");
    const toggle = w.findAll(".maptools label").find((l) => l.text().includes("Density"));
    await toggle?.find("input").setValue(false);
    expect(w.findComponent({ name: "MapDensity" }).exists()).toBe(false);
    expect(w.text()).not.toContain("events per 2° cell");
    w.unmount();
  });

  it("offers no density toggle when the whole window is loaded", async () => {
    stubWorld();
    const w = mountWith(QuakeMap, await makeContext(), { animate: false });
    await flushPromises();
    expect(w.findAll(".maptools label").some((l) => l.text().includes("Density"))).toBe(false);
    w.unmount();
  });

  it("draws Quaternary faults in the West Coast view and finds the trace under the pointer", async () => {
    stubWorld();
    const ctx = await makeContext({ regionId: "wc" });
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    const calls = () => vi.mocked(ctx.api.geo).mock.calls.filter((c) => c[0] === "wc-qfaults");
    expect(calls()).toHaveLength(1);
    const pick = () => w.find(".layerpick");
    const allBox = () => pick().find<HTMLInputElement>(".layerpick > label > input");
    expect(pick().text()).toContain("Quaternary faults");
    const layer = () => w.findComponent({ name: "MapFaults" });
    expect(pick().find(".pickcount").text()).toBe("2 of 6");
    expect(allBox().element.indeterminate).toBe(true);
    expect(layer().findAll("path.qf")).toHaveLength(2);
    await pick().find(".pickopen").trigger("click");
    await pick()
      .findAll(".pickrow button")
      .find((b) => b.text() === "All")
      ?.trigger("click");
    await pick().find(".pickopen").trigger("click");
    expect(allBox().element.checked).toBe(true);
    expect(allBox().element.indeterminate).toBe(false);
    expect(pick().find(".pickcount").exists()).toBe(false);
    expect(layer().findAll("path.qf")).toHaveLength(3);
    const svg = w.find("svg.map");
    const [px, py] = frameFor(WC).projection([-122.1, 37.6]) ?? [0, 0];
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    expect(w.find(".tip").text()).toBe(
      "Hayward fault zone, Southern Hayward section · Historic (<150 yr) · Between 1.0 and 5.0 mm/yr · Right lateral · Dip vertical",
    );
    expect(layer().find("path.hot").exists()).toBe(true);
    await svg.trigger("mousemove", { clientX: 2, clientY: 2 });
    expect(w.find(".tip").exists()).toBe(false);
    expect(layer().find("path.hot").exists()).toBe(false);
    await svg.trigger("mousemove", { clientX: 2, clientY: 2 });
    vi.spyOn(svg.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 2000, 1400));
    await svg.trigger("mousemove", { clientX: px * 2, clientY: py * 2 });
    expect(w.find(".tip").text()).toContain("Hayward");
    await w
      .findComponent({ name: "MapPlates" })
      .find("g")
      .trigger("mousemove", { clientX: 2, clientY: 2 });
    expect(w.find(".tip").text()).toContain("Hayward");
    await svg.trigger("mousemove", { clientX: 2, clientY: 2 });
    expect(w.find(".tip").exists()).toBe(false);
    const ev = new MouseEvent("mousemove", { clientX: px * 2, clientY: py * 2, bubbles: true });
    Object.defineProperty(ev, "target", { value: null });
    svg.element.dispatchEvent(ev);
    await nextTick();
    expect(w.find(".tip").text()).toContain("Hayward");
    await svg.trigger("mouseleave");
    expect(w.find(".tip").exists()).toBe(false);
    await svg.trigger("mouseleave");
    expect(pick().find(".pickmenu").exists()).toBe(false);
    expect(pick().find(".pickopen").attributes("title")).toContain("Quaternary faults to show");
    await pick().find(".pickopen").trigger("click");
    expect(pick().findAll(".pickmenu input")).toHaveLength(6);
    await pick().findAll(".pickmenu input")[0]?.setValue(false);
    expect(pick().find(".pickcount").text()).toBe("5 of 6");
    expect(allBox().element.indeterminate).toBe(true);
    expect(allBox().element.checked).toBe(false);
    expect(layer().findAll("path.qf")).toHaveLength(2);
    expect(w.findComponent({ name: "MapLegend" }).text()).not.toContain("Historic (<150 yr)");
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    expect(w.find(".tip").exists()).toBe(false);
    const rowButton = (label: string) =>
      pick()
        .findAll(".pickrow button")
        .find((b) => b.text() === label);
    await rowButton("None")?.trigger("click");
    expect(allBox().element.checked).toBe(false);
    expect(allBox().element.indeterminate).toBe(false);
    expect(pick().find(".pickcount").exists()).toBe(false);
    expect(layer().exists()).toBe(false);
    expect(w.findComponent({ name: "MapLegend" }).text()).not.toContain("dotted = inferred");
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    expect(w.find(".tip").exists()).toBe(false);
    await rowButton("All")?.trigger("click");
    expect(allBox().element.checked).toBe(true);
    expect(layer().findAll("path.qf")).toHaveLength(3);
    expect(calls()).toHaveLength(1);
    await allBox().setValue(false);
    expect(layer().exists()).toBe(false);
    await allBox().setValue(true);
    expect(layer().findAll("path.qf")).toHaveLength(3);
    const stray = new Event("change");
    Object.defineProperty(stray, "target", { value: document.createElement("div") });
    allBox().element.dispatchEvent(stray);
    await nextTick();
    expect(layer().exists()).toBe(false);
    await rowButton("All")?.trigger("click");
    await pick().find(".pickmenu").trigger("mousedown");
    expect(pick().find(".pickmenu").exists()).toBe(true);
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();
    expect(pick().find(".pickmenu").exists()).toBe(false);
    await pick().find(".pickopen").trigger("click");
    // Lock the map first: a free one hands the mousedown to d3-drag, which happy-dom cannot run.
    await w.find(".maplock").trigger("click");
    await w.find("svg.map").trigger("mousedown");
    expect(pick().find(".pickmenu").exists()).toBe(false);
    w.unmount();
  });

  it("has no fault layer in the global view and retries a failed fault load on the next toggle", async () => {
    stubWorld();
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = fakeApi();
    vi.mocked(api.geo).mockImplementation((name: string) => {
      if (name === "wc-qfaults") return Promise.reject(new Error("no faults"));
      return Promise.resolve(name === "plates" ? plateSegments : squareTopology);
    });
    const ctx = await makeContext({ api });
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    expect(w.find(".layerpick").exists()).toBe(false);
    await w.find("svg.map").trigger("mousemove", { clientX: 2, clientY: 2 });
    await ctx.catalog.setRegion("wc");
    await flushPromises();
    expect(err).toHaveBeenCalledWith("quaternary faults failed to load", expect.any(Error));
    await w.find("svg.map").trigger("mousemove", { clientX: 2, clientY: 2 });
    expect(w.find(".tip").exists()).toBe(false);
    await w.find(".pickopen").trigger("click");
    const rowButton = (label: string) =>
      w.findAll(".pickrow button").find((b) => b.text() === label);
    await rowButton("None")?.trigger("click");
    await rowButton("All")?.trigger("click");
    await flushPromises();
    expect(vi.mocked(api.geo).mock.calls.filter((c) => c[0] === "wc-qfaults")).toHaveLength(2);
    w.unmount();
  });

  it("sizes markers for fingers on coarse pointers and explains the lock to a touch", async () => {
    stubWorld();
    stubCanvas();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    const events = () => w.findComponent({ name: "MapEvents" });
    expect(events().props("minRadius")).toBe(7);
    const svg = w.find("svg.map");
    expect(svg.classes()).toContain("locked");
    vi.spyOn(svg.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 350));
    window.dispatchEvent(new Event("resize"));
    await nextTick();
    expect(events().props("minRadius")).toBe(14);
    const touch = (n: number) =>
      svg.element.dispatchEvent(Object.assign(new Event("touchstart"), { touches: { length: n } }));
    touch(2);
    await nextTick();
    expect(w.find(".touchhint").exists()).toBe(false);
    touch(1);
    await nextTick();
    expect(w.find(".touchhint").text()).toContain("Use two fingers");
    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(w.find(".touchhint").exists()).toBe(false);
    await w.find(".maplock").trigger("click");
    expect(w.find(".touchhint").text()).toContain("Map unlocked");
    touch(1);
    await nextTick();
    expect(w.find(".touchhint").text()).toContain("Map unlocked");
    await w.find(".maplock").trigger("click");
    expect(w.find(".touchhint").text()).toContain("Map locked");
    w.unmount();
    vi.useRealTimers();
  });

  it("uses animated transitions by default and throws without a region", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx);
    await flushPromises();
    await w.findAll(".zbtn")[0]?.trigger("click");
    await w.findAll(".zbtn")[2]?.trigger("click");
    expect(w.find("svg.map").exists()).toBe(true);
    const empty = createCatalog(fakeApi(), () => ctx.now);
    expect(() => mountWith(QuakeMap, { ...ctx, catalog: empty })).toThrow("no region selected");
  });
});
