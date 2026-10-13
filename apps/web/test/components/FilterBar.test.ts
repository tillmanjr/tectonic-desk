import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import FilterBar from "../../src/components/FilterBar.vue";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { fakeApi } from "../support/api.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

const listOf = (events: unknown[]) => ({
  events,
  count: events.length,
  truncated: false,
  query: {},
});

describe("FilterBar", () => {
  it("shows the bounds, clamps the magnitude input to the floor, and reports changes", async () => {
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue(listOf([event({ id: "a", mag: 5 }), event({ id: "b", mag: 6 })])),
    });
    const ctx = await makeContext({ api });
    const w = mountWith(FilterBar, ctx);
    const inputs = w.findAll("input");
    expect(inputs[0]?.attributes("min")).toBe("4.5");
    expect(w.text()).toContain("All 2 events shown");
    expect(w.find("button").attributes("disabled")).toBeDefined();
    await inputs[0]?.setValue("5.5");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, minMag: 5.5 });
    await inputs[1]?.setValue("6.5");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, maxMag: 6.5 });
    await inputs[2]?.setValue("10");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, minDepth: 10 });
    await inputs[3]?.setValue("");
    expect(ctx.setFilter).toHaveBeenLastCalledWith(EMPTY_FILTER);
    ctx.catalog.setFilter({ ...EMPTY_FILTER, minMag: 5.5, maxDepth: 200 });
    await nextTick();
    expect(inputs[0]?.element.value).toBe("5.5");
    expect(inputs[3]?.element.value).toBe("200");
    expect(w.text()).toContain("Showing 1 of 2 events");
    expect(w.find("button").attributes("disabled")).toBeUndefined();
    await w.find("button").trigger("click");
    expect(ctx.setFilter).toHaveBeenLastCalledWith(EMPTY_FILTER);
  });
  it("ignores change events from something other than an input", async () => {
    const ctx = await makeContext();
    const w = mountWith(FilterBar, ctx);
    const input = w.find("input");
    const ev = new Event("change");
    Object.defineProperty(ev, "target", { value: document.createElement("div") });
    input.element.dispatchEvent(ev);
    expect(ctx.setFilter).toHaveBeenLastCalledWith(EMPTY_FILTER);
  });
});
