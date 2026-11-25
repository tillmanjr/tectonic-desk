import { flushPromises } from "@vue/test-utils";
import { zoomIdentity } from "d3-zoom";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapShell from "../../src/components/MapShell.vue";
import QuakeMap from "../../src/components/QuakeMap.vue";
import type { MapView } from "../../src/lib/mapview.js";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("turning the global map", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("re-projects about the new centre, keeping the zoom and the place in the middle", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    const g = (): string | undefined => w.find("svg.map > g").attributes("transform");
    expect(w.find(".mapwrap .centrepick").exists()).toBe(true);
    // the whole view stays the whole view
    await w.findAll(".centrepick .cnudge")[0]?.trigger("click");
    await flushPromises();
    expect(ctx.setCentre).toHaveBeenCalledWith(135);
    expect(g()).toBe("translate(0,0) scale(1)");
    // zoomed in, the scale holds and the view shifts to keep the same place in the middle
    await w.get('[aria-label="Zoom in"]').trigger("click");
    const zoomed = g();
    ctx.centre.value = 120;
    await flushPromises();
    expect(g()).toContain("scale(1.8)");
    expect(g()).not.toBe(zoomed);
    // a view centred off the globe's outline goes back to the whole map
    const mv: MapView = w.findComponent(MapShell).props("mv");
    mv.setTransform(zoomIdentity.translate(500 - 4 * 3, 260 - 4 * 3).scale(4));
    await flushPromises();
    ctx.centre.value = 100;
    await flushPromises();
    expect(g()).toBe("translate(0,0) scale(1)");
    w.unmount();
  });

  it("draws the field grids at 150°E only, keeping the choice", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext();
    const w = mountWith(QuakeMap, ctx, { animate: false });
    await flushPromises();
    const select = w.get('select[aria-label="Field overlay"]');
    expect(select.attributes("disabled")).toBeUndefined();
    await select.setValue("gravity");
    ctx.centre.value = -30;
    await flushPromises();
    expect(select.attributes("disabled")).toBeDefined();
    expect(w.get(".fieldpick").attributes("data-hint")).toContain("150°E only");
    expect(w.findComponent({ name: "MapField" }).exists()).toBe(false);
    expect(select.element).toHaveProperty("value", "gravity");
    ctx.centre.value = 150;
    await flushPromises();
    expect(select.attributes("disabled")).toBeUndefined();
    w.unmount();
  });
});
