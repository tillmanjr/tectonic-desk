import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import FilterBar from "../../src/components/FilterBar.vue";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { fakeApi, raisedApi } from "../support/api.js";
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
    await w.find(".rtoggle").trigger("click");
    const inputs = w.findAll("input");
    expect(inputs[0]?.attributes("min")).toBe("4.5");
    expect(inputs[0]?.element.value).toBe("4.5");
    expect(inputs[1]?.element.value).toBe("");
    expect(w.text()).toContain("Window (UTC)");
    expect(w.find(".ftitle").text()).toBe("Refine");
    expect(w.find(".finfo").attributes("title")).toContain(
      "summary tiles and major events are unaffected",
    );
    expect(w.find(".fclear").attributes("disabled")).toBeDefined();
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
    expect(w.find(".fclear").attributes("disabled")).toBeUndefined();
    await w.find(".fclear").trigger("click");
    expect(ctx.setFilter).toHaveBeenLastCalledWith(EMPTY_FILTER);
  });
  it("bounds the date inputs to the catalogue start and today, in the active zone", async () => {
    const ctx = await makeContext();
    const w = mountWith(FilterBar, ctx);
    await w.find(".rtoggle").trigger("click");
    const dates = w.findAll<HTMLInputElement>("input.fdate");
    expect(dates[0]?.attributes("min")).toBe("1900-01-01");
    expect(dates[0]?.attributes("max")).toBe("2026-10-13");
    expect(dates[0]?.element.value).toBe("2026-09-13");
    expect(dates[1]?.element.value).toBe("2026-10-13");
    expect(w.find(".fclear").text()).toBe("Reset");
    await dates[0]?.setValue("2026-10-01");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, since: "2026-10-01" });
    await dates[1]?.setValue("2026-10-05");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({
      ...EMPTY_FILTER,
      since: "2026-09-05",
      until: "2026-10-05",
    });
    ctx.catalog.setFilter({ ...EMPTY_FILTER, since: "2026-10-01", until: "2026-10-05" });
    await nextTick();
    expect(dates[0]?.element.value).toBe("2026-10-01");
    await dates[1]?.setValue("2026-10-20");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({
      ...EMPTY_FILTER,
      since: "2026-10-01",
      until: "2026-10-20",
    });
    ctx.catalog.setFilter({ ...EMPTY_FILTER, until: "2026-09-01" });
    await nextTick();
    expect(dates[0]?.element.value).toBe("2026-09-01");
    expect(dates[1]?.element.value).toBe("2026-09-01");
    ctx.zone.value = "local";
    await nextTick();
    expect(w.text()).toContain("Window (local)");
  });
  it("shows the same thirty days and the view's own floor for the West Coast", async () => {
    const w = mountWith(FilterBar, await makeContext({ regionId: "wc" }));
    await w.find(".rtoggle").trigger("click");
    const dates = w.findAll<HTMLInputElement>("input.fdate");
    expect(dates[0]?.element.value).toBe("2026-09-13");
    expect(w.findAll("input")[0]?.element.value).toBe("2.5");
  });
  it("shows the span the dates match, sets the start from a preset, and reads Custom otherwise", async () => {
    const ctx = await makeContext();
    const w = mountWith(FilterBar, ctx);
    await w.find(".rtoggle").trigger("click");
    const select = w.find<HTMLSelectElement>("select.fspan");
    expect(select.element.value).toBe("0");
    expect(select.element.selectedOptions[0]?.text).toBe("30 days");
    await select.setValue("2");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, since: "2025-10-13" });
    ctx.catalog.setFilter({ ...EMPTY_FILTER, since: "2025-10-13" });
    await nextTick();
    expect(select.element.selectedOptions[0]?.text).toBe("1 year");
    ctx.catalog.setFilter({ ...EMPTY_FILTER, since: "2026-10-01", until: "2026-10-05" });
    await nextTick();
    expect(select.element.value).toBe("");
    expect(select.element.selectedOptions[0]?.text).toBe("Custom");
    ctx.catalog.setFilter({ ...EMPTY_FILTER, until: "2026-09-01" });
    await nextTick();
    await select.setValue("5");
    expect(ctx.setFilter).toHaveBeenLastCalledWith({
      ...EMPTY_FILTER,
      until: "2026-09-01",
      since: "1900-01-01",
    });
    const stray = document.createElement("select");
    const opt = document.createElement("option");
    opt.value = "99";
    stray.append(opt);
    stray.value = "99";
    const ev = new Event("change");
    Object.defineProperty(ev, "target", { value: stray });
    select.element.dispatchEvent(ev);
    const div = new Event("change");
    Object.defineProperty(div, "target", { value: document.createElement("div") });
    select.element.dispatchEvent(div);
    expect(ctx.setFilter).toHaveBeenCalledTimes(2);
  });
  it("explains a raised floor under the inputs", async () => {
    const plain = mountWith(FilterBar, await makeContext());
    expect(plain.find(".fnote").exists()).toBe(false);
    const w = mountWith(
      FilterBar,
      await makeContext({
        api: raisedApi(),
        range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
      }),
    );
    expect(w.find(".fnote").text()).toBe(
      "This window holds 7,312 events at M4.5+. Markers, table and the magnitude charts show the 1 at M6+ so the page stays responsive; the time chart covers all of them, and the map's Density toggle shades where they fall.",
    );
    await w.find(".rtoggle").trigger("click");
    expect(w.findAll("input")[0]?.element.value).toBe("4.5");
  });
  it("summarises the refinements in force while collapsed and toggles the hide flag", async () => {
    const ctx = await makeContext();
    const w = mountWith(FilterBar, ctx);
    expect(w.find(".rsummary").text()).toBe(
      "M4.5+ · 30 days from 2026-09-13 to 2026-10-13 · depth any",
    );
    expect(w.findAll(".rsummary .set")).toHaveLength(0);
    ctx.catalog.setFilter({ ...EMPTY_FILTER, minMag: 5, maxDepth: 70, since: "2026-10-01" });
    await nextTick();
    expect(w.find(".rsummary").text()).toBe(
      "M5+ · custom from 2026-10-01 to 2026-10-13 · depth to 70 km",
    );
    expect(w.findAll(".rsummary .set")).toHaveLength(3);
    expect(w.find("input.fdate").exists()).toBe(false);
    await w.find(".rhide input").setValue(true);
    expect(ctx.catalog.hideMarkers.value).toBe(true);
  });
  it("ignores change events from something other than an input", async () => {
    const ctx = await makeContext();
    const w = mountWith(FilterBar, ctx);
    await w.find(".rtoggle").trigger("click");
    const input = w.find("input");
    const ev = new Event("change");
    Object.defineProperty(ev, "target", { value: document.createElement("div") });
    input.element.dispatchEvent(ev);
    expect(ctx.setFilter).toHaveBeenLastCalledWith(EMPTY_FILTER);
  });
});
