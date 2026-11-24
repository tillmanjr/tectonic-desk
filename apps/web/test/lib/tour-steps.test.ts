import { describe, expect, it, vi } from "vitest";
import {
  EXAMPLE_MEASURES,
  EARTHQUAKES,
  EXAMPLE_EVENT,
  EXAMPLE_SECTIONS,
  EXAMPLE_VOLCANO,
  MECHANISM,
  SPACE,
  SPACE_HISTORY,
  SPACE_WEEK,
  VOLCANOES,
  MAP_TOOLS,
  ORIENTATION,
  TOURS,
} from "../../src/lib/tour-steps.js";
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
    expect(MECHANISM.sidePath).toBe(true);
    expect(MECHANISM.pageFor("active")).toBe("earthquakes");
    expect(EARTHQUAKES.steps.find((s) => s.detour !== undefined)?.id).toBe("mechanism");
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

  it("does nothing to a map that is not there", async () => {
    const ctx = fakeContext(null);
    for (const id of ["layers", "field", "section", "measure", "pin"])
      await run(MAP_TOOLS, id, ctx);
    expect(ctx.setSection).toHaveBeenCalledWith(null);
    expect(ctx.setSection).toHaveBeenCalledTimes(1);
  });
});
