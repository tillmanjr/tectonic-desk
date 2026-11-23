import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import QuakeMap from "../../src/components/QuakeMap.vue";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { makeContext, mountWith, type Context } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

async function mounted(): Promise<{ ctx: Context; w: VueWrapper }> {
  stubWorld();
  stubCanvas();
  const ctx = await makeContext();
  const w = mountWith(QuakeMap, ctx, { animate: false });
  await flushPromises();
  return { ctx, w };
}
/** Gives the stage a size, as a browser would. */
function stageOf(w: VueWrapper, width: number, height: number): void {
  vi.spyOn(w.find(".mapstage").element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 60, width, height),
  );
}
const escape = async (): Promise<void> => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await flushPromises();
};

describe("theater mode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
    document.body.style.overflow = "";
  });

  it("fills the window from the corner button, fits the map at its aspect, and unlocks it", async () => {
    const { w } = await mounted();
    const btn = w.find(".mapwrap .theaterbtn");
    expect(btn.attributes("aria-label")).toBe("Theater mode");
    expect(btn.attributes("data-hint")).toContain("fill the browser window");
    expect(w.find(".legend").exists()).toBe(true);
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("true");
    stageOf(w, 2000, 800);
    await btn.trigger("click");
    await flushPromises();
    expect(w.find(".mapcard").classes()).toContain("theater");
    expect(btn.attributes("aria-pressed")).toBe("true");
    expect(btn.attributes("aria-label")).toBe("Exit theater mode");
    expect(w.find(".legend").exists()).toBe(false);
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("false");
    expect(document.body.style.overflow).toBe("hidden");
    // The global frame is 1000 × 520: an 800 px tall stage fits it 1538.46 px wide.
    const style = w.find(".mapwrap").attributes("style");
    expect(style).toContain("height: 800px");
    expect(style).toContain("width: 1538.46");
    // A resize refits it; a narrow stage limits the width instead.
    stageOf(w, 1000, 800);
    window.dispatchEvent(new Event("resize"));
    await flushPromises();
    expect(w.find(".mapwrap").attributes("style")).toContain("width: 1000px");
    expect(w.find(".mapwrap").attributes("style")).toContain("height: 520px");
    // Leaving gives the lock and the page back.
    await btn.trigger("click");
    await flushPromises();
    expect(w.find(".mapcard").classes()).not.toContain("theater");
    expect(w.find(".mapwrap").attributes("style")).toBeUndefined();
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("true");
    expect(document.body.style.overflow).toBe("");
    expect(w.find(".legend").exists()).toBe(true);
    window.dispatchEvent(new Event("resize"));
    w.unmount();
  });

  it("lets Escape stand a tool down first, then leaves; keeps an unlocked map unlocked", async () => {
    const { w } = await mounted();
    await w.find(".maplock").trigger("click");
    stageOf(w, 1000, 800);
    await w.find(".theaterbtn").trigger("click");
    await w.find(".measurebtn").trigger("click");
    expect(w.find(".measurebtn").attributes("aria-pressed")).toBe("true");
    await escape();
    expect(w.find(".measurebtn").attributes("aria-pressed")).toBe("false");
    expect(w.find(".mapcard").classes()).toContain("theater");
    await escape();
    expect(w.find(".mapcard").classes()).not.toContain("theater");
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("false");
    w.unmount();
  });

  it("refits for another region's frame and gives the page back when unmounted", async () => {
    const { ctx, w } = await mounted();
    stageOf(w, 1000, 1000);
    await w.find(".theaterbtn").trigger("click");
    await flushPromises();
    const before = w.find(".mapwrap").attributes("style");
    await ctx.catalog.setRegion("wc");
    await flushPromises();
    await nextTick();
    expect(w.find(".mapwrap").attributes("style")).not.toBe(before);
    w.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
