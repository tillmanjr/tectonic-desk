import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PageSwitch from "../../src/components/PageSwitch.vue";
import VolcanoesPage from "../../src/components/VolcanoesPage.vue";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("PageSwitch", () => {
  it("marks the current page and emits picks", async () => {
    const w = mount(PageSwitch, { props: { page: "volcanoes" } });
    const buttons = w.findAll("button");
    expect(buttons.map((b) => b.text())).toEqual(["Earthquakes", "Volcanoes", "Active Earth"]);
    expect(buttons[1]?.attributes("aria-current")).toBe("page");
    expect(buttons[0]?.attributes("aria-current")).toBeUndefined();
    await buttons[0]?.trigger("click");
    expect(w.emitted("pick")?.[0]).toEqual(["earthquakes"]);
  });
});

describe("VolcanoesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("lays out tiles, cards, refine bar, map, table and charts, and retries after an error", async () => {
    stubWorld();
    stubCanvas();
    const ctx = await makeContext({ volcanoes: true });
    const w = mountWith(VolcanoesPage, ctx);
    await flushPromises();
    expect(w.find(".stats").exists()).toBe(true);
    expect(w.find(".sectionlabel").text()).toBe("Elevated or changed in the last 7 days");
    expect(w.findAll(".mcard")).toHaveLength(2);
    expect(w.find(".filters").exists()).toBe(true);
    expect(w.find("svg.map").exists()).toBe(true);
    expect(w.findAll("tr.ev")).toHaveLength(5);
    expect(w.findComponent({ name: "MapVolcanoes" }).exists()).toBe(true);
    await w.find(".filters .rhide input").setValue(true);
    expect(w.findComponent({ name: "MapVolcanoes" }).exists()).toBe(false);
    expect(w.find(".mapcount").text()).toBe("Showing 5 of 5 volcanoes");
    expect(w.findAll("tr.ev")).toHaveLength(5);
    await w.find(".filters .rhide input").setValue(false);
    expect(w.findComponent({ name: "MapVolcanoes" }).exists()).toBe(true);
    expect(w.findAll(".chart")).toHaveLength(2);
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
