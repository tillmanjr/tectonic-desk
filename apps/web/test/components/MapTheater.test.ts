import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuakeMap from "../../src/components/QuakeMap.vue";
import { frameFor } from "../../src/lib/geo.js";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { GLOBAL } from "../support/events.js";
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

  it("fills the window from the corner button, covering the area with the map, and unlocks it", async () => {
    const { w } = await mounted();
    const btn = w.find(".mapwrap .theaterbtn");
    expect(btn.attributes("aria-label")).toBe("Theater mode");
    expect(btn.attributes("data-hint")).toContain("fill the browser window");
    expect(w.find(".legend").exists()).toBe(true);
    expect(w.find("svg.map").attributes("preserveAspectRatio")).toBeUndefined();
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("true");
    await btn.trigger("click");
    await flushPromises();
    expect(w.find(".mapcard").classes()).toContain("theater");
    expect(w.find("svg.map").attributes("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(btn.attributes("aria-pressed")).toBe("true");
    expect(btn.attributes("aria-label")).toBe("Exit theater mode");
    expect(w.find(".legend").exists()).toBe(false);
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("false");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.classList.contains("in-theater")).toBe(true);
    // Leaving gives the lock and the page back.
    await btn.trigger("click");
    await flushPromises();
    expect(w.find(".mapcard").classes()).not.toContain("theater");
    expect(w.find("svg.map").attributes("preserveAspectRatio")).toBeUndefined();
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("true");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.classList.contains("in-theater")).toBe(false);
    expect(w.find(".legend").exists()).toBe(true);
    w.unmount();
  });

  it("reads the pointer through the cropped, centred map", async () => {
    const { ctx, w } = await mounted();
    await w.find(".theaterbtn").trigger("click");
    // A 2000 × 800 box covered by the 1000 × 520 frame: 2 px a unit, 120 px cropped top and bottom.
    vi.spyOn(w.find("svg.map").element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 50, 2000, 800),
    );
    await w.find(".pinbtn").trigger("click");
    const svg = w.find("svg.map");
    // A click alone: the unlocked map would hand a press to d3-zoom, which happy-dom cannot follow.
    await svg.trigger("click", { clientX: 1000, clientY: 450 });
    const pin = ctx.pins.doc.value.current.global;
    const centre = frameFor(GLOBAL).projection.invert?.([500, 260]) ?? [NaN, NaN];
    expect(pin?.lon).toBeCloseTo(centre[0], 6);
    expect(pin?.lat).toBeCloseTo(centre[1], 6);
    w.unmount();
  });

  it("lets Escape stand a tool down first, then leaves; keeps an unlocked map unlocked", async () => {
    const { w } = await mounted();
    await w.find(".maplock").trigger("click");
    await w.find(".theaterbtn").trigger("click");
    await w.find(".measurebtn").trigger("click");
    expect(w.find(".measurebtn").attributes("aria-pressed")).toBe("true");
    await escape();
    expect(w.find(".measurebtn").attributes("aria-pressed")).toBe("false");
    expect(w.find(".mapcard").classes()).toContain("theater");
    // an Escape a side panel over the theater already took leaves the theater be
    const taken = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    taken.preventDefault();
    document.dispatchEvent(taken);
    await flushPromises();
    expect(w.find(".mapcard").classes()).toContain("theater");
    await escape();
    expect(w.find(".mapcard").classes()).not.toContain("theater");
    expect(w.find(".maplock").attributes("aria-pressed")).toBe("false");
    w.unmount();
  });

  it("gives the page back when unmounted in theater mode", async () => {
    const { w } = await mounted();
    await w.find(".theaterbtn").trigger("click");
    expect(document.body.style.overflow).toBe("hidden");
    w.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.classList.contains("in-theater")).toBe(false);
  });
});
