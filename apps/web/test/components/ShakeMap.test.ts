import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import CombinedMap from "../../src/components/CombinedMap.vue";
import QuakeMap from "../../src/components/QuakeMap.vue";
import { ApiRequestError } from "../../src/lib/api.js";
import { frameFor } from "../../src/lib/geo.js";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { resetShakeCache } from "../../src/lib/shakemap.js";
import { fakeApi, gridOf, listOf, summaryOf } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, GLOBAL, WC } from "../support/events.js";
import { makeContext, mountWith, type Context } from "../support/mount.js";
import { coneGrid, shakeMap } from "../support/shakemap.js";
import { stubWorld } from "../support/world.js";

const shaken = event({ id: "us1", types: ["origin", "shakemap"] });
const plain = event({ id: "us2", types: ["origin"], longitude: 170, latitude: -40 });
function apiWith(events = [shaken, plain], over = {}) {
  return fakeApi({
    events: vi.fn().mockResolvedValue(listOf(events)),
    summary: vi.fn().mockResolvedValue(summaryOf(events)),
    grid: vi.fn().mockResolvedValue(gridOf(events)),
    ...over,
  });
}
/** Mounts a map; `selected` is chosen first, so the map has not zoomed to it and points project plainly. */
async function mounted(
  component = QuakeMap,
  api = apiWith(),
  regionId = "global",
  selected: string | null = null,
): Promise<{ ctx: Context; w: VueWrapper }> {
  stubWorld();
  stubCanvas();
  const ctx = await makeContext({ api, regionId, volcanoes: component === CombinedMap });
  ctx.catalog.selectedId.value = selected;
  const w = mountWith(component, ctx, { animate: false });
  await flushPromises();
  return { ctx, w };
}
const toggle = (w: VueWrapper) => w.get(".shaketoggle");
const note = (w: VueWrapper): string | null => {
  const n = w.find(".shakenote");
  return n.exists() ? n.text() : null;
};
const tipText = (w: VueWrapper): string | null => {
  const t = w.find(".tip");
  return t.exists() ? t.text() : null;
};

describe("ShakeMap layer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
    resetShakeCache();
  });

  it("stays idle until shown, and asks for a selection with a ShakeMap", async () => {
    const { ctx, w } = await mounted();
    expect(toggle(w).attributes("data-hint")).toContain("USGS ShakeMap");
    expect(toggle(w).classes()).toContain("unavailable");
    expect(note(w)).toBeNull();
    await toggle(w).get("input").setValue(true);
    expect(note(w)).toBe("select an event with one");
    ctx.catalog.selectedId.value = "us2";
    await flushPromises();
    expect(note(w)).toBe("select an event with one");
    expect(ctx.api.shakemap).not.toHaveBeenCalled();
    w.unmount();
  });

  it("shades the selected event's bands, keys them in the legend and reads the intensity", async () => {
    const { ctx, w } = await mounted(QuakeMap, apiWith(), "global", "us1");
    expect(toggle(w).classes()).not.toContain("unavailable");
    expect(ctx.api.shakemap).not.toHaveBeenCalled();
    await toggle(w).get("input").setValue(true);
    expect(note(w)).toBe("loading");
    await flushPromises();
    expect(note(w)).toBeNull();
    expect(ctx.api.shakemap).toHaveBeenCalledWith("us1");
    const bands = w.findAll("g.shake path.sband");
    expect(bands.map((b) => b.attributes("style"))).toHaveLength(6);
    expect(bands[0]?.attributes("d")).toMatch(/^M/);
    expect(w.find("g.shake path.sextent").attributes("d")).toMatch(/^M/);
    expect(w.find(".shakerow").text()).toContain(
      "MMI · USGS ShakeMap · us · v4 · reviewed · max MMI 7.2",
    );
    // The readout under the pointer, cleared off the grid, on leaving and over a marker.
    const svg = w.find("svg.map");
    const [px, py] = frameFor(GLOBAL).projection([shaken.longitude, shaken.latitude]) ?? [0, 0];
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    expect(tipText(w)).toBe("MMI 7.2 · VII, very strong shaking, moderate damage");
    await svg.trigger("mousemove", { clientX: 2, clientY: 2 });
    expect(tipText(w)).toBeNull();
    const [ox, oy] = frameFor(GLOBAL).projection([0, 0]) ?? [0, 0];
    await svg.trigger("mousemove", { clientX: ox, clientY: oy });
    expect(tipText(w)).toBeNull();
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    await svg.trigger("mouseleave");
    expect(tipText(w)).toBeNull();
    await svg.trigger("mouseleave");
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    const marker = w.find("[data-hit] circle");
    await marker.trigger("mousemove", { clientX: px, clientY: py });
    // Back on the bands after a marker: the readout returns.
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    expect(tipText(w)).toContain("MMI 7.2");
    // Another event without one clears the bands; turning it off stops the readout.
    ctx.catalog.selectedId.value = "us2";
    await flushPromises();
    expect(w.find("g.shake").exists()).toBe(false);
    expect(w.find(".shakerow").exists()).toBe(false);
    ctx.catalog.selectedId.value = "us1";
    await flushPromises();
    expect(w.findAll("g.shake path.sband")).toHaveLength(6);
    expect(ctx.api.shakemap).toHaveBeenCalledTimes(1);
    await toggle(w).get("input").setValue(false);
    expect(w.find("g.shake").exists()).toBe(false);
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    expect(tipText(w)).toBeNull();
    w.unmount();
  });

  it("says when the server has none or USGS is down, and ignores a stale answer", async () => {
    let release: (v: never) => void = () => undefined;
    const api = apiWith([shaken, plain], {
      shakemap: vi
        .fn()
        .mockRejectedValueOnce(new ApiRequestError(404, "none"))
        .mockRejectedValueOnce(new ApiRequestError(502, "down"))
        .mockImplementationOnce(
          () =>
            new Promise<never>((_resolve, reject) => {
              release = reject;
            }),
        ),
    });
    const { ctx, w } = await mounted(QuakeMap, api);
    ctx.catalog.selectedId.value = "us1";
    await toggle(w).get("input").setValue(true);
    await flushPromises();
    expect(note(w)).toBe("none for this event");
    resetShakeCache();
    await toggle(w).get("input").setValue(false);
    await toggle(w).get("input").setValue(true);
    await flushPromises();
    expect(note(w)).toBe("unavailable");
    // A slow request that fails after the reader has moved on changes nothing.
    await toggle(w).get("input").setValue(false);
    await toggle(w).get("input").setValue(true);
    expect(note(w)).toBe("loading");
    await toggle(w).get("input").setValue(false);
    release(new Error("late") as never);
    await flushPromises();
    expect(note(w)).toBeNull();
    w.unmount();
  });

  it("ignores a stale success after the selection moved on", async () => {
    let resolveLate: (v: ReturnType<typeof shakeMap>) => void = () => undefined;
    const api = apiWith([shaken, plain], {
      shakemap: vi.fn().mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLate = resolve;
          }),
      ),
    });
    const { ctx, w } = await mounted(QuakeMap, api);
    await toggle(w).get("input").setValue(true);
    ctx.catalog.selectedId.value = "us1";
    await nextTick();
    ctx.catalog.selectedId.value = "us2";
    await nextTick();
    resolveLate(shakeMap());
    await flushPromises();
    expect(w.find("g.shake").exists()).toBe(false);
    w.unmount();
  });

  it("gives a fault under the pointer precedence over the readout in the West Coast view", async () => {
    const wcEvent = event({
      id: "nc1",
      types: ["shakemap"],
      longitude: -122.1,
      latitude: 37.6,
    });
    const api = apiWith([wcEvent], {
      shakemap: vi.fn().mockResolvedValue(shakeMap({ grid: coneGrid(-122.1, 37.6) })),
    });
    const { w } = await mounted(QuakeMap, api, "wc", "nc1");
    await toggle(w).get("input").setValue(true);
    await flushPromises();
    const svg = w.find("svg.map");
    const [px, py] = frameFor(WC).projection([-122.1, 37.6]) ?? [0, 0];
    await svg.trigger("mousemove", { clientX: px, clientY: py });
    expect(tipText(w)).toContain("Hayward");
    const [qx, qy] = frameFor(WC).projection([-121.4, 37.0]) ?? [0, 0];
    await svg.trigger("mousemove", { clientX: qx, clientY: qy });
    expect(tipText(w)).toMatch(/^MMI /);
    w.unmount();
  });

  it("draws under the volcanoes on Active Earth and keys the legend beside them", async () => {
    const { ctx, w } = await mounted(CombinedMap);
    ctx.catalog.selectedId.value = "us1";
    await toggle(w).get("input").setValue(true);
    await flushPromises();
    expect(w.find("g.shake").exists()).toBe(true);
    expect(w.find(".shakerow").exists()).toBe(true);
    w.unmount();
  });
});
