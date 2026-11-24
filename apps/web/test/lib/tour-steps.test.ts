import { describe, expect, it, vi } from "vitest";
import {
  EXAMPLE_MEASURES,
  EARTHQUAKES,
  EXAMPLE_EVENT,
  EXAMPLE_SECTIONS,
  EXAMPLE_VOLCANO,
  MAP_NAV,
  MECHANISM,
  REFINE_QUAKES,
  REFINE_URLS,
  SPACE,
  SPACE_HISTORY,
  SPACE_WEEK,
  VOLCANOES,
  MAP_TOOLS,
  ORIENTATION,
} from "../../src/lib/tour-steps.js";
import { DEEP_DIVES, TOURS } from "../../src/lib/tour-catalog.js";
import type { StepContext, Tour } from "../../src/lib/tour.js";
import { fakeContext, fakeMap } from "../support/tour.js";

const step = (tour: Tour, id: string) => {
  const s = tour.steps.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no step ${id}`);
  return s;
};
async function run(tour: Tour, id: string, ctx: StepContext): Promise<void> {
  const s = step(tour, id);
  await s.enter?.(ctx);
  await s.leave?.(ctx);
}

describe("tour content", () => {
  it("gives every step a unique id, a title and text, and runs the map tour off the Space page", () => {
    for (const t of TOURS) {
      expect(new Set(t.steps.map((s) => s.id)).size).toBe(t.steps.length);
      for (const s of t.steps) expect(s.title.length * s.body.length).toBeGreaterThan(0);
    }
    expect(ORIENTATION.pageFor("space")).toBe("active");
    expect(MAP_TOOLS.pageFor("space")).toBe("active");
    expect(MAP_TOOLS.pageFor("volcanoes")).toBe("volcanoes");
  });

  it("selects the largest event for the detail step and clears it after", async () => {
    const ctx = fakeContext(null);
    await run(ORIENTATION, "detail", ctx);
    expect(ctx.selectLargest).toHaveBeenCalled();
    expect(ctx.clearSelection).toHaveBeenCalled();
  });

  it("sets the map up for each map step and takes it down after", async () => {
    const mv = fakeMap(true);
    const zoomTo = vi.fn();
    const reset = vi.fn();
    mv.zoomTo = zoomTo;
    mv.reset = reset;
    const ctx = fakeContext(mv);
    mv.showPlates.value = false;
    await step(MAP_TOOLS, "layers").enter?.(ctx);
    expect([mv.showPlates.value, mv.showTeeth.value]).toEqual([true, true]);

    await step(MAP_TOOLS, "field").enter?.(ctx);
    expect(mv.field.value).toBe("gravity");
    await step(MAP_TOOLS, "field").leave?.(ctx);
    expect(mv.field.value).toBe("none");

    await run(MAP_TOOLS, "section", ctx);
    expect(ctx.setSection).toHaveBeenNthCalledWith(1, EXAMPLE_SECTIONS.global);
    expect(ctx.setSection).toHaveBeenNthCalledWith(2, null);
    expect(zoomTo).toHaveBeenCalledWith(140.75, 38.3);
    expect(reset).toHaveBeenCalled();

    await step(MAP_TOOLS, "measure").enter?.(ctx);
    expect(mv.measure.shown.value).toMatchObject({
      a: EXAMPLE_MEASURES.global[0],
      b: EXAMPLE_MEASURES.global[1],
    });
    await step(MAP_TOOLS, "measure").leave?.(ctx);
    expect(mv.measure.shown.value).toBeNull();

    await step(MAP_TOOLS, "pin").enter?.(ctx);
    expect(mv.pin.open.value).toBe(true);
    await step(MAP_TOOLS, "pin").enter?.(ctx);
    expect(mv.pin.open.value).toBe(true);
    await step(MAP_TOOLS, "pin").leave?.(ctx);
    expect(mv.pin.open.value).toBe(false);
    await step(MAP_TOOLS, "pin").leave?.(ctx);
    expect(mv.pin.open.value).toBe(false);
  });

  it("uses the regional examples off the global map", async () => {
    const mv = fakeMap(false);
    const ctx = fakeContext(mv);
    await step(MAP_TOOLS, "section").enter?.(ctx);
    expect(ctx.setSection).toHaveBeenCalledWith(EXAMPLE_SECTIONS.regional);
    await step(MAP_TOOLS, "measure").enter?.(ctx);
    expect(mv.measure.shown.value?.a).toEqual(EXAMPLE_MEASURES.regional[0]);
  });

  it("opens the refine bar, an event with a mechanism, its ShakeMap and the beachballs, and closes them after", async () => {
    const ctx = fakeContext(null);
    await run(EARTHQUAKES, "refine", ctx);
    for (const id of ["detail", "mechanism", "impact", "mark"]) await run(EARTHQUAKES, id, ctx);
    await run(EARTHQUAKES, "shakemap", ctx);
    await run(EARTHQUAKES, "mechanisms", ctx);
    expect(ctx.go).toHaveBeenCalledTimes(5);
    expect(ctx.go).toHaveBeenCalledWith(EXAMPLE_EVENT.url);
    expect(vi.mocked(ctx.setSwitch).mock.calls).toEqual([
      ["refine.earthquakes", true],
      ["refine.earthquakes", false],
      ["map.shake", true],
      ["map.shake", false],
      ["map.mech", true],
      ["map.mech", false],
    ]);
    expect(EARTHQUAKES.pageFor("space")).toBe("earthquakes");
  });

  it("opens the example event on every step of the mechanism side path, offered from the Mechanism step", async () => {
    const ctx = fakeContext(null);
    for (const s of MECHANISM.steps) await s.enter?.(ctx);
    expect(ctx.go).toHaveBeenCalledTimes(MECHANISM.steps.length);
    expect(MECHANISM.deep).toEqual({ area: "Earthquake detail" });
    expect(MECHANISM.pageFor("active")).toBe("earthquakes");
    expect(
      EARTHQUAKES.steps.flatMap((s) => (s.detour === undefined ? [] : [[s.id, s.detour.tour]])),
    ).toEqual([
      ["refine", "refine-quakes"],
      ["mechanism", "mechanism"],
      ["table", "refine-tables"],
    ]);
  });

  it("opens the volcano refine bar and the example volcano, and closes the bar after", async () => {
    const ctx = fakeContext(null);
    for (const s of VOLCANOES.steps) await run(VOLCANOES, s.id, ctx);
    expect(ctx.go).toHaveBeenCalledTimes(5);
    expect(ctx.go).toHaveBeenCalledWith(EXAMPLE_VOLCANO.url);
    expect(vi.mocked(ctx.setSwitch).mock.calls).toEqual([
      ["refine.volcanoes", true],
      ["refine.volcanoes", false],
    ]);
    expect(VOLCANOES.pageFor("space")).toBe("volcanoes");
  });

  it("shows the space page over a week, then over eleven years", async () => {
    const ctx = fakeContext(null);
    for (const s of SPACE.steps) await s.enter?.(ctx);
    const urls = vi.mocked(ctx.go).mock.calls.map(([u]) => u);
    expect(urls.filter((u) => u === SPACE_WEEK)).toHaveLength(10);
    expect(urls.at(-1)).toBe(SPACE_HISTORY);
    expect(SPACE.pageFor("active")).toBe("space");
  });

  it("closes the event panel before the cross-section profile, keeping the example's window", async () => {
    const mv = fakeMap(false);
    const ctx = fakeContext(mv);
    await step(EARTHQUAKES, "profile").enter?.(ctx);
    expect(ctx.go).toHaveBeenCalledWith(EXAMPLE_EVENT.window);
    expect(ctx.setSection).toHaveBeenCalledWith(EXAMPLE_SECTIONS.regional);
    expect(EXAMPLE_EVENT.url.startsWith(EXAMPLE_EVENT.window)).toBe(true);
  });

  it("sets an example for each control of the earthquake refine bar, folded or open", async () => {
    const ctx = fakeContext(null);
    for (const s of REFINE_QUAKES.steps) await run(REFINE_QUAKES, s.id, ctx);
    expect(vi.mocked(ctx.go).mock.calls.map(([u]) => u)).toEqual([
      REFINE_URLS.base,
      REFINE_URLS.base,
      REFINE_URLS.status,
      REFINE_URLS.base,
      REFINE_URLS.magnitude,
      REFINE_URLS.depth,
      REFINE_URLS.window,
      REFINE_URLS.custom,
      REFINE_URLS.long,
      REFINE_URLS.long,
      REFINE_URLS.base,
    ]);
    const calls = vi.mocked(ctx.setSwitch).mock.calls;
    expect(calls.slice(0, 4).map(([, on]) => on)).toEqual([false, false, false, true]);
    expect(calls.slice(-3)).toEqual([
      ["refine.earthquakes", true],
      ["refine.earthquakes.hide", true],
      ["refine.earthquakes.hide", false],
    ]);
    expect(REFINE_QUAKES.deep).toEqual({ area: "Refine" });
    expect(REFINE_QUAKES.pageFor("space")).toBe("earthquakes");
  });

  it("locks, unlocks, zooms, selects and goes to theater on the map, putting theater back after", async () => {
    const mv = fakeMap();
    const reset = vi.fn();
    mv.reset = reset;
    const ctx = fakeContext(mv);
    await run(MAP_NAV, "zoom", ctx);
    expect(mv.transform.value.k).toBeCloseTo(1.8 ** 2);
    for (const s of MAP_NAV.steps) await run(MAP_NAV, s.id, ctx);
    expect(vi.mocked(ctx.setSwitch).mock.calls).toEqual([
      ["map.lock", true],
      ["map.lock", false],
      ["map.theater", true],
      ["map.theater", false],
    ]);
    expect(mv.transform.value.k).toBeCloseTo(1.8 ** 3);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(ctx.selectLargest).toHaveBeenCalled();
    expect(ctx.clearSelection).toHaveBeenCalled();
    const none = fakeContext(null);
    await run(MAP_NAV, "zoom", none);
    await run(MAP_NAV, "readouts", none);
    expect(MAP_NAV.deep).toEqual({ area: "Map" });
    expect(MAP_NAV.pageFor("space")).toBe("active");
    expect(MAP_NAV.pageFor("volcanoes")).toBe("volcanoes");
    expect(MAP_TOOLS.steps[0]?.detour?.tour).toBe("map-nav");
  });

  it("runs every deep dive's steps with a map on screen and without one", async () => {
    for (const deep of DEEP_DIVES) {
      for (const mv of [fakeMap(), null]) {
        const ctx = fakeContext(mv);
        for (const s of deep.steps) await run(deep, s.id, ctx);
      }
    }
    expect(DEEP_DIVES.every((d) => d.deep !== undefined)).toBe(true);
  });

  it("does nothing to a map that is not there", async () => {
    const ctx = fakeContext(null);
    for (const id of ["layers", "field", "section", "measure", "pin"])
      await run(MAP_TOOLS, id, ctx);
    expect(ctx.setSection).toHaveBeenCalledWith(null);
    expect(ctx.setSection).toHaveBeenCalledTimes(1);
  });
});
