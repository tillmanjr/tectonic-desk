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
    expect(inputs[0]?.element.value).toBe("4.5");
    expect(inputs[1]?.element.value).toBe("");
    expect(w.text()).toContain("Dates (UTC)");
    expect(w.find(".ftitle").text()).toBe("Refine");
    expect(w.find(".finfo").attributes("title")).toContain(
      "summary tiles and major events are unaffected",
    );
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
    expect(w.find("button").attributes("disabled")).toBeUndefined();
    await w.find("button").trigger("click");
    expect(ctx.setFilter).toHaveBeenLastCalledWith(EMPTY_FILTER);
  });
  it("bounds the date inputs to the last 90 days, in the active zone", async () => {
    const ctx = await makeContext();
    const w = mountWith(FilterBar, ctx);
    const dates = w.findAll<HTMLInputElement>("input.fdate");
    expect(dates[0]?.attributes("min")).toBe("2026-07-15");
    expect(dates[0]?.attributes("max")).toBe("2026-10-13");
    expect(dates[0]?.element.value).toBe("2026-09-13");
    expect(dates[1]?.element.value).toBe("2026-10-13");
    expect(w.find(".fclear").text()).toBe("Reset");
    await dates[0]?.setValue("2026-10-01");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, since: "2026-10-01" });
    await dates[1]?.setValue("2026-10-05");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, until: "2026-10-05" });
    ctx.catalog.setFilter({ ...EMPTY_FILTER, since: "2026-10-01", until: "2026-10-05" });
    await nextTick();
    expect(dates[0]?.element.value).toBe("2026-10-01");
    ctx.catalog.setFilter({ ...EMPTY_FILTER, until: "2026-09-01" });
    await nextTick();
    expect(dates[0]?.element.value).toBe("2026-09-01");
    expect(dates[1]?.element.value).toBe("2026-09-01");
    ctx.zone.value = "local";
    await nextTick();
    expect(w.text()).toContain("Dates (local)");
  });
  it("shows the same thirty days and the view's own floor for the West Coast", async () => {
    const w = mountWith(FilterBar, await makeContext({ regionId: "wc" }));
    const dates = w.findAll<HTMLInputElement>("input.fdate");
    expect(dates[0]?.element.value).toBe("2026-09-13");
    expect(w.findAll("input")[0]?.element.value).toBe("2.5");
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
