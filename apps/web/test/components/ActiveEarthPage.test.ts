import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActiveEarthPage from "../../src/components/ActiveEarthPage.vue";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("ActiveEarthPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("stacks both summaries, card rows, refine bars, one map and both analyses, and retries a volcano error", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext({ volcanoes: true });
    const w = mountWith(ActiveEarthPage, ctx);
    await flushPromises();
    // each card row wears its dataset's trim; the analyses below are labelled plainly
    const order = w
      .findAll(".stats, .cardrow, .filters, .mapcard, .grid2")
      .map((n) => n.classes().find((c) => c !== "refine") ?? "");
    expect(order).toEqual([
      "stats",
      "stats",
      "cardrow",
      "cardrow",
      "filters",
      "filters",
      "mapcard",
      "grid2",
      "grid2",
    ]);
    expect(w.find(".cardrow.quakes .sectionlabel").text()).toBe(
      "Major events · M6+ or a PAGER alert",
    );
    expect(w.find(".cardrow.volcanoes .sectionlabel").text()).toBe(
      "Elevated or changed in the last 7 days … 1 more",
    );
    expect(w.findAll(".grid2").map((g) => g.element.previousElementSibling?.textContent)).toEqual([
      "Earthquakes",
      "Volcanoes",
    ]);
    expect(w.find(".filters.earthquakes").exists()).toBe(true);
    expect(w.find(".filters.volcanoes").exists()).toBe(true);
    expect(w.findAll("svg.map")).toHaveLength(1);
    expect(w.find(".mapcount").text()).toBe("Showing 1 of 1 events · 5 of 5 volcanoes");
    expect(w.findAll(".chart")).toHaveLength(5);
    expect(w.find(".banner.error").exists()).toBe(false);
    ctx.volcanoes.error.value = "live feed down";
    await flushPromises();
    expect(w.find(".banner.error").text()).toContain("live feed down");
    const before = vi.mocked(ctx.api.volcanoStatus).mock.calls.length;
    await w.find(".banner.error button").trigger("click");
    await flushPromises();
    expect(vi.mocked(ctx.api.volcanoStatus).mock.calls.length).toBe(before + 1);
    w.unmount();
  });
});
