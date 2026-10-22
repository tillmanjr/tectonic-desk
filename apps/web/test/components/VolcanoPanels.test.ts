import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import EruptionDecadeChart from "../../src/components/EruptionDecadeChart.vue";
import VeiChart from "../../src/components/VeiChart.vue";
import VolcanoCards from "../../src/components/VolcanoCards.vue";
import VolcanoFilterBar from "../../src/components/VolcanoFilterBar.vue";
import VolcanoTable from "../../src/components/VolcanoTable.vue";
import VolcanoTiles from "../../src/components/VolcanoTiles.vue";
import { EMPTY_VOLCANO_FILTER } from "../../src/lib/volcanoes.js";
import { makeContext, mountWith } from "../support/mount.js";
import { status, volcano } from "../support/volcanoes.js";

describe("VolcanoTiles", () => {
  it("counts elevated, GeoNet, continuing and new-activity entries, falling back to status changes", async () => {
    const ctx = await makeContext({ volcanoes: true });
    const w = mountWith(VolcanoTiles, ctx);
    const values = () => w.findAll(".stat .v").map((v) => v.text());
    expect(values()).toEqual(["1", "1", "1", "1"]);
    expect(w.text()).toContain("highest level Watch");
    expect(w.text()).toContain("New activity");
    ctx.volcanoes.reports.value = [];
    ctx.volcanoes.statuses.value = [];
    await nextTick();
    expect(w.text()).toContain("Status changes");
    expect(w.text()).toContain("all monitored US volcanoes at Normal");
    expect(values()).toEqual(["0", "0", "1", "1"]);
  });
});

describe("VolcanoCards", () => {
  it("lists elevated and changed volcanoes with their agency label and selects on click", async () => {
    const ctx = await makeContext({ volcanoes: true });
    const w = mountWith(VolcanoCards, ctx);
    const cards = w.findAll(".mcard");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.text()).toContain("Kilauea · United States");
    expect(cards[0]?.text()).toContain("USGS Watch · Orange");
    expect(cards[0]?.text()).toContain("at this level since");
    expect(cards[1]?.text()).toContain("GeoNet level 2 · Yellow");
    expect(cards[1]?.text()).toContain("Moderate to heightened");
    await cards[0]?.trigger("click");
    expect(ctx.selectVolcano).toHaveBeenCalledWith(332010);
    ctx.volcanoes.statuses.value = [];
    ctx.volcanoes.changes.value = [
      status({ level: "NORMAL", color: "GREEN" }),
      status({
        id: 7,
        key: "avo",
        number: null,
        name: "Alaskan Volcanoes",
        level: "NORMAL",
        color: "GREEN",
      }),
    ];
    await nextTick();
    const after = w.findAll(".mcard");
    expect(after).toHaveLength(2);
    expect(after[0]?.text()).toContain("back to normal");
    expect(after[0]?.text()).toContain("changed");
    const orphan = after.find((c) => c.text().includes("Alaskan Volcanoes"));
    expect(orphan?.attributes("disabled")).toBeDefined();
    await orphan?.trigger("click");
    expect(ctx.selectVolcano).toHaveBeenCalledTimes(1);
    ctx.volcanoes.changes.value = [];
    await nextTick();
    expect(w.text()).toContain("No monitored volcano is above normal");
  });
});

describe("VolcanoFilterBar", () => {
  it("writes each select to the filter and resets", async () => {
    const ctx = await makeContext({ volcanoes: true });
    const w = mountWith(VolcanoFilterBar, ctx);
    expect(w.find(".rsummary").text()).toBe(
      "setting any · type any · last eruption any · status any",
    );
    await w.find(".rhead").trigger("click");
    const selects = w.findAll("select");
    expect(selects).toHaveLength(4);
    expect(w.find(".fclear").attributes("disabled")).toBeDefined();
    await selects[0]?.setValue("rift");
    expect(ctx.setVolcanoFilter).toHaveBeenLastCalledWith({
      ...EMPTY_VOLCANO_FILTER,
      setting: "rift",
    });
    await selects[1]?.setValue("shield");
    expect(ctx.setVolcanoFilter).toHaveBeenLastCalledWith({
      ...EMPTY_VOLCANO_FILTER,
      type: "shield",
    });
    await selects[2]?.setValue("recent");
    expect(ctx.setVolcanoFilter).toHaveBeenLastCalledWith({
      ...EMPTY_VOLCANO_FILTER,
      age: "recent",
    });
    await selects[3]?.setValue("elevated");
    expect(ctx.setVolcanoFilter).toHaveBeenLastCalledWith({
      ...EMPTY_VOLCANO_FILTER,
      status: "elevated",
    });
    ctx.volcanoes.setFilter({ ...EMPTY_VOLCANO_FILTER, type: "shield" });
    await nextTick();
    expect(selects[1]?.element.value).toBe("shield");
    expect(w.find(".fclear").attributes("disabled")).toBeUndefined();
    await selects[1]?.setValue("");
    expect(ctx.setVolcanoFilter).toHaveBeenLastCalledWith(EMPTY_VOLCANO_FILTER);
    const stray = new Event("change");
    Object.defineProperty(stray, "target", { value: document.createElement("div") });
    selects[0]?.element.dispatchEvent(stray);
    expect(ctx.setVolcanoFilter).toHaveBeenLastCalledWith({
      ...EMPTY_VOLCANO_FILTER,
      type: "shield",
      setting: null,
    });
    await w.find(".fclear").trigger("click");
    expect(ctx.setVolcanoFilter).toHaveBeenLastCalledWith(EMPTY_VOLCANO_FILTER);
    await w.find(".rhead").trigger("click");
    expect(w.find(".rsummary .set").text()).toBe("type shield");
    await w.find(".rhide input").setValue(true);
    expect(ctx.volcanoes.hideMarkers.value).toBe(true);
  });
});

describe("VolcanoTable", () => {
  it("sorts by status then name, re-sorts on header clicks, and selects rows", async () => {
    const ctx = await makeContext({ volcanoes: true });
    ctx.volcanoes.volcanoes.value = [
      ...ctx.volcanoes.volcanoes.value,
      volcano({
        number: 1,
        name: "Ancient",
        lastEruptionYear: -5000,
        elevationM: null,
        country: "Atlantis",
      }),
    ];
    const w = mountWith(VolcanoTable, ctx);
    const names = () => w.findAll("tr.ev td:first-child").map((td) => td.text());
    expect(names()).toEqual([
      "Kilauea",
      "Whakaari/White Island",
      "Ancient",
      "Clear Lake",
      "Etna",
      "St. Helens",
    ]);
    expect(w.text()).toContain("6 in this view");
    expect(w.findAll("tr.ev")[0]?.text()).toContain("USGS Watch · Orange");
    expect(w.findAll("tr.ev")[2]?.text()).toContain("not monitored here");
    expect(w.findAll("tr.ev")[2]?.text()).toContain("5001 BCE");
    expect(w.findAll("tr.ev")[2]?.text()).toContain("—");
    const headers = w.findAll("th");
    await headers[0]?.trigger("click");
    expect(names()[0]).toBe("Ancient");
    await headers[0]?.trigger("click");
    expect(names()[0]).toBe("Whakaari/White Island");
    await headers[1]?.trigger("click");
    expect(names()[0]).toBe("Ancient");
    await headers[2]?.trigger("click");
    expect(names()[0]).toBe("Clear Lake");
    await headers[3]?.trigger("click");
    expect(names()[0]).toBe("Etna");
    await headers[5]?.trigger("click");
    expect(names()[0]).toBe("Etna");
    await headers[4]?.trigger("click");
    expect(names()[0]).toBe("Kilauea");
    await headers[4]?.trigger("click");
    expect(names()[0]).toBe("Ancient");
    await headers[4]?.trigger("click");
    ctx.volcanoes.statuses.value = [
      ...ctx.volcanoes.statuses.value,
      status({ id: 10, level: "ADVISORY", color: "YELLOW" }),
    ];
    await nextTick();
    expect(w.findAll("tr.ev")[0]?.text()).toContain("USGS Watch · Orange");
    await w.findAll("tr.ev")[0]?.trigger("click");
    expect(ctx.selectVolcano).toHaveBeenCalledWith(332010);
    await w.findAll("tr.ev")[1]?.trigger("keydown", { key: "Enter" });
    expect(ctx.selectVolcano).toHaveBeenCalledWith(241040);
    ctx.volcanoes.setFilter({ ...EMPTY_VOLCANO_FILTER, type: "shield" });
    await nextTick();
    expect(w.text()).toContain("1 of 6");
  });
});

describe("eruption charts", () => {
  it("counts eruption starts per decade and VEI bins, with empty states", async () => {
    const ctx = await makeContext({ volcanoes: true });
    const decades = mountWith(EruptionDecadeChart, ctx);
    expect(decades.findAll("rect").length).toBeGreaterThan(20);
    expect(decades.find(".cap").text()).toContain(
      "8 eruption starts since 1800 across 5 volcanoes; 2 earlier",
    );
    const vei = mountWith(VeiChart, ctx);
    expect(vei.findAll("rect")).toHaveLength(9);
    expect(vei.find(".cap").text()).toContain(
      "10 eruptions by Volcanic Explosivity Index; 2 without a VEI and 2 with a queried value",
    );
    ctx.volcanoes.setFilter({ ...EMPTY_VOLCANO_FILTER, age: "unknown" });
    await flushPromises();
    expect(decades.find(".cap").text()).toContain("No eruptions since 1800");
    expect(vei.find(".cap").text()).toContain("No eruption records");
    expect(vi.isMockFunction(ctx.api.geo)).toBe(true);
  });
});
