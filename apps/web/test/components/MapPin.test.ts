import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MapPin from "../../src/components/MapPin.vue";
import QuakeMap from "../../src/components/QuakeMap.vue";
import type { MapFrame } from "../../src/lib/geo.js";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { PIN_HOLD_MS } from "../../src/lib/pin-tool.js";
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
async function clickMap(w: VueWrapper, x: number, y: number): Promise<void> {
  const svg = w.find("svg.map");
  await svg.trigger("mousedown", { clientX: x, clientY: y });
  await svg.trigger("click", { clientX: x, clientY: y });
}
function hit(w: VueWrapper) {
  const h = w.find(".mappin:not(.ghost) .phit");
  (h.element as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () =>
    undefined;
  return h;
}
const tipText = (w: VueWrapper): string | null => {
  const t = w.find(".tip");
  return t.exists() ? t.text() : null;
};

describe("map pin", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("arms from the Pin button, reads out the pointer, places and names the pin", async () => {
    const { ctx, w } = await mounted();
    const btn = w.find(".pinbtn");
    expect(btn.attributes("data-hint")).toContain("press and hold");
    expect(w.find(".pinbar").exists()).toBe(false);
    await btn.trigger("click");
    expect(btn.attributes("aria-pressed")).toBe("true");
    expect(w.find(".pinbar .ptitle").text()).toBe("Pin · Global");
    expect(w.find(".pinbar .pcoords").text()).toBe("—");
    const svg = w.find("svg.map");
    expect(svg.classes()).toContain("arming");
    await svg.trigger("mousemove", { clientX: 400, clientY: 260 });
    expect(tipText(w)).toMatch(/^−?\d+\.\d{4}, −?\d+\.\d{4} · click to place$/);
    expect(w.find(".pinbar .pcoords").text()).toMatch(/^−?\d+\.\d{4}, /);
    expect(w.find(".mappin.ghost").exists()).toBe(true);
    expect(w.find(".mappin.ghost .phit").exists()).toBe(false);
    await svg.trigger("mousemove", { clientX: 2, clientY: 2 });
    expect(tipText(w)).toBeNull();
    await svg.trigger("mousemove", { clientX: 400, clientY: 260 });
    await svg.trigger("mouseleave");
    expect(tipText(w)).toBeNull();
    expect(w.find(".mappin.ghost").exists()).toBe(false);
    // A pan is not a placement; nor is a click off the map.
    await svg.trigger("mousedown", { clientX: 400, clientY: 260 });
    await svg.trigger("click", { clientX: 420, clientY: 260 });
    await clickMap(w, 2, 2);
    expect(ctx.pins.doc.value.current.global).toBeNull();
    await clickMap(w, 400, 260);
    const placed = ctx.pins.doc.value.current.global;
    expect(placed).not.toBeNull();
    expect(svg.classes()).not.toContain("arming");
    expect(w.findAll(".mappin")).toHaveLength(1);
    expect(w.find(".mappin .pshadow").exists()).toBe(true);
    const name = w.find(".pinbar .pname input");
    await name.setValue("Station A");
    expect(ctx.pins.doc.value.current.global?.name).toBe("Station A");
    const stray = new Event("change");
    Object.defineProperty(stray, "target", { value: document.createElement("div") });
    name.element.dispatchEvent(stray);
    expect(ctx.pins.doc.value.current.global?.name).toBe("Station A");
    // A click on the pin stays with the pin.
    await hit(w).trigger("click", { clientX: 400, clientY: 250 });
    await hit(w).trigger("touchstart");
    await hit(w).trigger("mousemove", { clientX: 400, clientY: 250 });
    expect(tipText(w)).toMatch(/^Station A · /);
    await hit(w).trigger("mouseleave");
    expect(tipText(w)).toBeNull();
    await w.find(".pinbar .pclose").trigger("click");
    expect(w.find(".pinbar").exists()).toBe(false);
    w.unmount();
  });

  it("lists recent placements, re-places and removes", async () => {
    const { ctx, w } = await mounted();
    await w.find(".pinbtn").trigger("click");
    expect(w.find(".precent").exists()).toBe(false);
    await clickMap(w, 400, 260);
    const buttons = () => w.findAll(".pinbar button");
    await buttons()
      .find((b) => b.text() === "Re-place")
      ?.trigger("click");
    expect(w.find(".pinbar .pnote").text()).toContain("Click the map");
    await buttons()
      .find((b) => b.text() === "Cancel")
      ?.trigger("click");
    expect(w.find(".pinbar .pname").exists()).toBe(true);
    await buttons()
      .find((b) => b.text() === "Re-place")
      ?.trigger("click");
    await clickMap(w, 500, 300);
    expect(w.find(".precent summary").text()).toBe("Recent (2)");
    const rows = w.findAll(".precent li");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.find(".pwho").text()).toBe("unnamed");
    expect(rows[0]?.find(".pwhen").text()).toMatch(/UTC$/);
    expect(rows[0]?.find(".pview").text()).toBe("Global");
    await buttons()
      .find((b) => b.text() === "Remove")
      ?.trigger("click");
    expect(ctx.pins.doc.value.current.global).toBeNull();
    expect(w.findAll(".mappin")).toHaveLength(0);
    expect(w.find(".pinbar .pnote").text()).toBe("No pin in this view.");
    await buttons()
      .find((b) => b.text() === "Place")
      ?.trigger("click");
    expect(w.find("svg.map").classes()).toContain("arming");
    w.unmount();
  });

  it("moves only after a held press, reading out as it goes", async () => {
    const { ctx, w } = await mounted();
    ctx.pins.place("global", [-160, -5]);
    await nextTick();
    vi.useFakeTimers();
    const before = ctx.pins.doc.value.current.global;
    // A quick drag leaves the pin alone and opens the bar.
    await hit(w).trigger("pointerdown", { pointerId: 1, clientX: 300, clientY: 300 });
    await hit(w).trigger("pointermove", { pointerId: 1, clientX: 340, clientY: 300 });
    expect(tipText(w)).toMatch(/^−5\.0000, −160\.0000$/);
    await hit(w).trigger("pointerup", { pointerId: 1 });
    expect(ctx.pins.doc.value.current.global).toEqual(before);
    expect(w.find(".pinbar").exists()).toBe(false);
    await hit(w).trigger("pointerdown", { pointerId: 2, clientX: 300, clientY: 300 });
    expect(w.find(".mappin").classes()).toContain("holding");
    await hit(w).trigger("pointerup", { pointerId: 2 });
    expect(w.find(".pinbar").exists()).toBe(true);
    // A held press lifts it; it follows the pointer and sets down on release.
    await hit(w).trigger("pointerdown", { pointerId: 3, clientX: 300, clientY: 300 });
    vi.advanceTimersByTime(PIN_HOLD_MS);
    await nextTick();
    expect(w.find(".mappin").classes()).toContain("lifted");
    await hit(w).trigger("mousemove", { clientX: 300, clientY: 300 });
    expect(tipText(w)).toBeNull();
    await hit(w).trigger("pointermove", { pointerId: 3, clientX: 500, clientY: 260 });
    expect(tipText(w)).toMatch(/ · release to set down$/);
    await hit(w).trigger("mouseleave");
    expect(tipText(w)).not.toBeNull();
    await hit(w).trigger("pointerup", { pointerId: 3 });
    expect(tipText(w)).toBeNull();
    const moved = ctx.pins.doc.value.current.global;
    expect(moved?.id).toBe(before?.id);
    expect(moved?.lon).not.toBe(-160);
    expect(ctx.pins.doc.value.history[0]).toEqual(moved);
    // Escape drops a lifted pin back; a cancelled press does nothing.
    await hit(w).trigger("pointerdown", { pointerId: 4, clientX: 300, clientY: 300 });
    vi.advanceTimersByTime(PIN_HOLD_MS);
    await nextTick();
    await hit(w).trigger("pointermove", { pointerId: 4, clientX: 2, clientY: 2 });
    expect(tipText(w)).toBeNull();
    await hit(w).trigger("pointermove", { pointerId: 4, clientX: 520, clientY: 280 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    await hit(w).trigger("pointercancel", { pointerId: 4 });
    expect(ctx.pins.doc.value.current.global).toEqual(moved);
    w.unmount();
  });

  it("stands the section tool down when armed, and the other way round", async () => {
    const { w } = await mounted();
    const section = w.find(".sectionbtn:not(.pinbtn)");
    await section.trigger("click");
    await w.find(".pinbtn").trigger("click");
    expect(section.attributes("aria-pressed")).toBe("false");
    expect(w.find(".pinbar .pnote").text()).toContain("Click the map");
    await section.trigger("click");
    expect(w.find(".pinbar .pnote").text()).toBe("No pin in this view.");
    await w.find(".pinbar button").trigger("click");
    await w.find("svg.map").trigger("mousemove", { clientX: 400, clientY: 260 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(tipText(w)).toBeNull();
    expect(w.find("svg.map").classes()).not.toContain("arming");
    w.unmount();
  });

  it("keeps a pin per view and cancels a placement on a region change", async () => {
    const { ctx, w } = await mounted();
    ctx.pins.place("wc", [-120, 40]);
    await w.find(".pinbtn").trigger("click");
    expect(w.findAll(".mappin")).toHaveLength(0);
    await ctx.catalog.setRegion("wc");
    await flushPromises();
    expect(w.find(".pinbar .ptitle").text()).toBe("Pin · West Coast");
    expect(w.find("svg.map").classes()).not.toContain("arming");
    expect(w.findAll(".mappin")).toHaveLength(1);
    w.unmount();
  });

  it("draws nothing for a point the projection cannot place", () => {
    const frame = { projection: () => null } as unknown as MapFrame;
    const w = mount(MapPin, {
      props: { frame, k: 1, at: [0, 0], holding: false, lifted: false },
    });
    expect(w.find(".mappin").exists()).toBe(false);
    w.unmount();
  });
});
