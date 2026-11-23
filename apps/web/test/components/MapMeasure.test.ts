import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MapMeasure from "../../src/components/MapMeasure.vue";
import QuakeMap from "../../src/components/QuakeMap.vue";
import { frameFor } from "../../src/lib/geo.js";
import { resetMapCaches } from "../../src/lib/mapview.js";
import { stubCanvas } from "../support/canvas.js";
import { GLOBAL } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

async function mounted(): Promise<VueWrapper> {
  stubWorld();
  stubCanvas();
  const ctx = await makeContext();
  const w = mountWith(QuakeMap, ctx, { animate: false });
  await flushPromises();
  return w;
}
async function clickMap(w: VueWrapper, x: number, y: number): Promise<void> {
  const svg = w.find("svg.map");
  await svg.trigger("mousedown", { clientX: x, clientY: y });
  await svg.trigger("click", { clientX: x, clientY: y });
}
const lines = (w: VueWrapper): string[] => w.findAll(".measure .mlabel tspan").map((t) => t.text());
function capturable(w: VueWrapper, i: number) {
  const h = w.findAll(".measure .mhit")[i];
  if (h === undefined) throw new Error("no handle");
  (h.element as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () =>
    undefined;
  return h;
}

describe("Measure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMapCaches();
  });

  it("arms, reads as the line is placed, places two points, drags an end and clears", async () => {
    const w = await mounted();
    const btn = w.find(".measurebtn");
    expect(btn.attributes("data-hint")).toContain("chord");
    expect(btn.attributes("aria-pressed")).toBe("false");
    await clickMap(w, 400, 260);
    expect(w.find(".measure").exists()).toBe(false);
    await btn.trigger("click");
    expect(btn.attributes("aria-pressed")).toBe("true");
    expect(w.find("svg.map").classes()).toContain("arming");
    await clickMap(w, 400, 260);
    expect(w.findAll(".measure .mhandle")).toHaveLength(1);
    expect(w.find(".measure .mline").exists()).toBe(false);
    expect(w.find(".measure .mlabel").exists()).toBe(false);
    await w.find("svg.map").trigger("mousemove", { clientX: 600, clientY: 260 });
    expect(w.find(".measure .mline").classes()).toContain("placing");
    const placing = lines(w);
    expect(placing[0]).toMatch(/^Δ \d+\.\d\d° · surface [\d,]+ km$/);
    expect(placing[1]).toMatch(/^chord [\d,]+ km · dips [\d,.]+ km, [a-z ]+$/);
    await clickMap(w, 600, 260);
    expect(w.find("svg.map").classes()).not.toContain("arming");
    expect(w.findAll(".measure .mhandle")).toHaveLength(2);
    expect(w.find(".measure .mline").classes()).not.toContain("placing");
    expect(lines(w)).toEqual(placing);
    expect(Number(w.find(".measure .mlabelbox").attributes("width"))).toBeGreaterThan(100);
    // Dragging an end reads as it goes and commits on release.
    const b = capturable(w, 1);
    await b.trigger("pointerdown", { pointerId: 1, clientX: 600, clientY: 260 });
    await b.trigger("pointermove", { pointerId: 1, clientX: 700, clientY: 200 });
    const dragged = lines(w);
    expect(dragged).not.toEqual(placing);
    await b.trigger("pointermove", { pointerId: 1, clientX: 2, clientY: 2 });
    await b.trigger("pointerup", { pointerId: 1 });
    expect(lines(w)).toEqual(dragged);
    await capturable(w, 0).trigger("touchstart");
    // A cancelled press sets the end down where it was dragged to.
    const a = capturable(w, 0);
    await a.trigger("pointerdown", { pointerId: 2, clientX: 400, clientY: 260 });
    await a.trigger("pointercancel", { pointerId: 2 });
    expect(lines(w)).toEqual(dragged);
    // A second click on the button clears it.
    await btn.trigger("click");
    expect(w.find(".measure").exists()).toBe(false);
    expect(btn.attributes("aria-pressed")).toBe("false");
    w.unmount();
  });

  it("stands the section and pin tools down, and cancels on Escape", async () => {
    const w = await mounted();
    const measure = w.find(".measurebtn");
    const section = w.find(".sectionbtn:not(.measurebtn):not(.pinbtn)");
    await section.trigger("click");
    await measure.trigger("click");
    expect(section.attributes("aria-pressed")).toBe("false");
    await section.trigger("click");
    expect(measure.attributes("aria-pressed")).toBe("false");
    await measure.trigger("click");
    await w.find(".pinbtn").trigger("click");
    expect(measure.attributes("aria-pressed")).toBe("false");
    await measure.trigger("click");
    expect(w.find(".pinbar .pnote").text()).not.toContain("Click the map");
    await clickMap(w, 400, 260);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(measure.attributes("aria-pressed")).toBe("false");
    expect(w.find(".measure").exists()).toBe(false);
    w.unmount();
  });

  it("puts the label under the line near the top of the map, and skips points off the projection", () => {
    const frame = frameFor(GLOBAL);
    const path = geoPath(frame.projection);
    const props = { frame, path, k: 1, pending: null, cursor: null };
    const near = mount(MapMeasure, {
      props: {
        ...props,
        line: { a: [-170, 84] as [number, number], b: [-160, 84] as [number, number], halfKm: 0 },
        lines: ["a", "b"] as [string, string],
      },
    });
    expect(near.find(".mlabelbox").attributes("y")).toBe("10");
    near.unmount();
    const off = { ...frame, projection: Object.assign(() => null, frame.projection) };
    const lost = mount(MapMeasure, {
      props: {
        ...props,
        frame: off,
        line: { a: [0, 0] as [number, number], b: [10, 0] as [number, number], halfKm: 0 },
        lines: ["a", "b"] as [string, string],
      },
    });
    expect(lost.findAll(".mhandle")).toHaveLength(0);
    expect(lost.find(".mlabel").exists()).toBe(false);
    lost.unmount();
    const empty = mount(MapMeasure, { props: { ...props, line: null, lines: null } });
    expect(empty.find(".mline").exists()).toBe(false);
    expect(empty.findAll(".mhandle")).toHaveLength(0);
    empty.unmount();
  });
});
