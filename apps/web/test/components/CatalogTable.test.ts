import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CatalogTable from "../../src/components/CatalogTable.vue";
import { fakeApi, raisedApi } from "../support/api.js";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { event, mech } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

const a = event({
  id: "a",
  time: "2026-10-12T03:00:00Z",
  mag: 5.5,
  depthKm: 195.2,
  place: "Tonga",
  mechanisms: [mech()],
});
const b = event({
  id: "b",
  time: "2026-10-12T01:00:00Z",
  mag: 6.1,
  depthKm: 10,
  place: "Alaska",
  mechanisms: [mech({ kind: "fm" })],
});
const d = event({ id: "d", time: "2026-10-11T00:00:00Z", mag: 5.5, depthKm: 30, place: "Chile" });
const c = event({
  id: "c",
  time: "2026-10-12T02:00:00Z",
  mag: null,
  depthKm: null,
  place: null,
  eventType: "quarry blast",
  magType: null,
});

async function table() {
  const api = fakeApi({
    events: vi
      .fn()
      .mockResolvedValue({ events: [a, b, c, d], count: 4, truncated: false, query: {} }),
  });
  const ctx = await makeContext({ api });
  ctx.catalog.select("b");
  return { ctx, w: mountWith(CatalogTable, ctx) };
}
const ids = (w: VueWrapper) => w.findAll("tr.ev").map((r) => r.attributes("data-id"));

describe("CatalogTable", () => {
  it("lists events newest first with tags, chips and the selected row", async () => {
    const { w } = await table();
    expect(w.find("h2").text()).toContain("4 events");
    expect(w.find("th").text()).toBe("Time (UTC)");
    expect(ids(w)).toEqual(["a", "c", "b", "d"]);
    const rows = w.findAll("tr.ev");
    expect(rows[0]?.text()).toContain("MT");
    expect(rows[2]?.text()).toContain("FM");
    expect(rows[2]?.classes()).toContain("sel");
    expect(rows[1]?.text()).toContain("quarry blast");
    expect(rows[1]?.text()).toContain("unknown location");
    expect(rows[1]?.findAll("td")[1]?.text()).toBe("—");
    expect(rows[1]?.findAll("td")[2]?.text()).toBe("—");
    expect(rows[0]?.findAll("td")[1]?.text()).toBe("5.5mww");
  });
  it("shows the filtered count and rows when a filter is active", async () => {
    const { ctx, w } = await table();
    ctx.catalog.setFilter({ ...EMPTY_FILTER, minMag: 6 });
    await w.vm.$nextTick();
    expect(w.find("h2").text()).toContain("1 of 4 events");
    expect(ids(w)).toEqual(["b"]);
  });
  it("counts against the window total when the floor was raised", async () => {
    const ctx = await makeContext({
      api: raisedApi(),
      range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
    });
    const w = mountWith(CatalogTable, ctx);
    expect(w.find("h2").text()).toContain("1 of 7,312 events");
  });
  it("sorts by each column and toggles direction, nulls last on the way down", async () => {
    const { w } = await table();
    const th = w.findAll("th");
    await th[1]?.trigger("click");
    expect(ids(w)).toEqual(["b", "a", "d", "c"]);
    await th[1]?.trigger("click");
    expect(ids(w)).toEqual(["c", "a", "d", "b"]);
    await th[2]?.trigger("click");
    expect(ids(w)).toEqual(["a", "d", "b", "c"]);
    await th[3]?.trigger("click");
    expect(ids(w)).toEqual(["c", "b", "d", "a"]);
    expect(th[3]?.attributes("aria-sort")).toBe("ascending");
    await th[3]?.trigger("click");
    expect(ids(w)).toEqual(["a", "d", "b", "c"]);
    expect(th[3]?.attributes("aria-sort")).toBe("descending");
    await th[0]?.trigger("click");
    expect(th[0]?.attributes("aria-sort")).toBe("descending");
    expect(th[3]?.attributes("aria-sort")).toBeUndefined();
  });
  it("selects on click and on Enter", async () => {
    const { ctx, w } = await table();
    await w.find("tr.ev").trigger("click");
    expect(ctx.select).toHaveBeenLastCalledWith("a");
    await w.findAll("tr.ev")[2]?.trigger("keydown", { key: "Enter" });
    expect(ctx.select).toHaveBeenLastCalledWith("b");
    await w.findAll("tr.ev")[2]?.trigger("keydown", { key: "a" });
    expect(ctx.select).toHaveBeenCalledTimes(2);
  });

  it("filters its rows by column behind the Filter toggle, marks headers, and clears", async () => {
    const { ctx, w } = await table();
    expect(w.find("tr.frow").exists()).toBe(false);
    await w.find(".filtertoggle").trigger("click");
    expect(w.find("tr.frow").exists()).toBe(true);
    const magFrom = w.find("input[aria-label='Magnitude from']");
    await magFrom.setValue("6");
    await magFrom.trigger("change");
    expect(ids(w)).toEqual(["b"]);
    expect(w.find("h2").text()).toContain("1 of 4 events · filtered");
    const heads = () => w.findAll("thead tr:first-child th");
    expect(heads()[1]?.classes()).toContain("fon");
    expect(heads()[0]?.classes()).not.toContain("fon");
    await w.find(".clearall").trigger("click");
    expect(ids(w)).toEqual(["a", "c", "b", "d"]);
    expect(w.find(".clearall").exists()).toBe(false);
    expect(w.find("h2").text()).toContain("4 events · tap");
    const until = w.find("input[aria-label='Time to']");
    await until.setValue("2026-10-11");
    await until.trigger("change");
    expect(ids(w)).toEqual(["d"]);
    expect(heads()[0]?.classes()).toContain("fon");
    expect(until.classes()).toContain("set");
    const since = w.find("input[aria-label='Time from']");
    await since.setValue("2026-10-11");
    await since.trigger("change");
    expect(ids(w)).toEqual(["d"]);
    const depthTo = w.find("input[aria-label='Depth to']");
    await depthTo.setValue("20");
    await depthTo.trigger("change");
    expect(ids(w)).toEqual([]);
    expect(w.find("h2").text()).toContain("0 of 4 events · filtered");
    // A malformed date clears that bound (b is after Oct 11 and shallow); a region change resets and closes the row.
    await until.setValue("nope");
    await until.trigger("change");
    expect(ids(w)).toEqual(["b"]);
    expect(heads()[0]?.classes()).toContain("fon");
    await ctx.catalog.setRegion("wc");
    await flushPromises();
    expect(w.find("tr.frow").exists()).toBe(false);
    expect(w.find(".clearall").exists()).toBe(false);
    w.unmount();
  });
});
