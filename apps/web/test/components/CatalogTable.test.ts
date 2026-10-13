import type { VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CatalogTable from "../../src/components/CatalogTable.vue";
import { fakeApi } from "../support/api.js";
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
});
