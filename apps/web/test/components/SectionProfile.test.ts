import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import SectionProfile from "../../src/components/SectionProfile.vue";
import type { Section } from "../../src/lib/section.js";
import { fakeApi } from "../support/api.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { volcano } from "../support/volcanoes.js";

/** A 10° equatorial line, about 1112 km. */
const eq: Section = { a: [0, 0], b: [10, 0], halfKm: 50 };
const corridor = [
  event({ id: "shallow", longitude: 2, latitude: 0.1, depthKm: 10, mag: 5.5, place: "Near A" }),
  event({ id: "mid", longitude: 5, latitude: -0.2, depthKm: 60, mag: 6.5, place: "Halfway" }),
  event({ id: "deep", longitude: 8, latitude: 0, depthKm: 95, mag: null, place: "Near end" }),
  event({ id: "nodepth", longitude: 4, latitude: 0, depthKm: null }),
  event({ id: "outside", longitude: 5, latitude: 3, depthKm: 10 }),
];

async function profile(section: Section = eq, volcanoes = false, events = corridor) {
  const api = fakeApi({
    events: vi
      .fn()
      .mockResolvedValue({ events, count: events.length, truncated: false, query: {} }),
  });
  const ctx = await makeContext({ api, volcanoes });
  ctx.section.value = section;
  const w = mountWith(SectionProfile, ctx, { volcanoes });
  await flushPromises();
  return { ctx, w };
}

describe("SectionProfile", () => {
  it("renders nothing without a section", async () => {
    const ctx = await makeContext();
    const w = mountWith(SectionProfile, ctx);
    expect(w.find(".sectionpanel").exists()).toBe(false);
    w.unmount();
  });

  it("plots corridor events by depth and distance at true scale, with the caption and selection", async () => {
    const { ctx, w } = await profile();
    expect(w.find(".stitle").text()).toBe("Section A–A′ · N 90° E · 1112 km · 3 events");
    const marks = w.findAll(".hypo");
    expect(marks).toHaveLength(3);
    // 1112 km over 840 px: 100 km of depth is 75.5 px of plot, plus 66 px of margins.
    expect(w.find("svg").attributes("viewBox")).toBe("0 0 900 142");
    const cy = marks.map((m) => Number(m.find("circle:not(.ring)").attributes("cy")));
    expect(cy[0]).toBeCloseTo(40 + 10 / (1111.95 / 840), 0);
    expect(cy[1]).toBeGreaterThan(cy[0] ?? 0);
    expect(marks[1]?.attributes("aria-label")).toBe("M6.5 · Halfway · 60 km");
    expect(marks[2]?.find("circle:not(.ring)").attributes("r")).toBe("2");
    expect(w.find(".cap").text()).toContain("at ×1 (true scale)");
    expect(w.find(".cap").text()).toContain("within ±50 km");
    expect(w.find(".cap").text()).toContain("1 without a reported depth not shown.");
    expect(w.find(".cap").text()).not.toContain("deeper than");
    expect(w.findAll(".endlabel").map((t) => t.text())).toEqual(["A", "A′"]);
    await marks[1]?.trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("mid");
    ctx.catalog.select("mid");
    await nextTick();
    expect(w.find(".hypo.sel .ring").exists()).toBe(true);
    await marks[0]?.trigger("keydown", { key: "Enter" });
    expect(ctx.select).toHaveBeenCalledWith("shallow");
    w.unmount();
  });

  it("exaggerates vertically, caps the axis and counts what falls below it", async () => {
    const { w } = await profile();
    const ve = w.find<HTMLSelectElement>("select[aria-label='Vertical exaggeration']");
    ve.element.value = "9";
    await ve.trigger("change");
    expect(w.find("svg").attributes("viewBox")).toBe("0 0 900 142");
    await ve.setValue("4");
    // 100 km × 4 over 1.3237 km/px = 302 px of plot, plus 66 px of margins.
    expect(w.find("svg").attributes("viewBox")).toBe("0 0 900 368");
    expect(w.find(".cap").text()).toContain("at ×4;");
    // A short line: 100 km of depth needs 1250 px at ×1, so the axis is capped and the deep event dropped.
    const short = await profile({ a: [0, 0], b: [0.6, 0], halfKm: 50 }, false, [
      event({ id: "s", longitude: 0.1, latitude: 0, depthKm: 10 }),
      event({ id: "d", longitude: 0.5, latitude: 0, depthKm: 60 }),
    ]);
    expect(short.w.find("svg").attributes("viewBox")).toBe("0 0 900 480");
    expect(short.w.findAll(".hypo")).toHaveLength(1);
    expect(short.w.find(".cap").text()).toContain("1 deeper than 33 km not shown.");
    short.w.unmount();
    const one = await profile({ a: [0, 0], b: [0.6, 0], halfKm: 50 }, false, [
      event({ id: "s", longitude: 0.1, latitude: 0, depthKm: 10 }),
    ]);
    expect(one.w.find(".stitle").text()).toContain("· 1 event");
    one.w.unmount();
    w.unmount();
  });

  it("changes the corridor width, clears, and says when the corridor is empty", async () => {
    const { ctx, w } = await profile();
    const half = w.find("input[aria-label='Corridor half-width in km']");
    await half.setValue("120");
    await half.trigger("change");
    expect(ctx.setSection).toHaveBeenLastCalledWith({ ...eq, halfKm: 120 });
    const calls = ctx.setSection.mock.calls.length;
    await half.setValue("");
    await half.trigger("change");
    await half.setValue("abc");
    await half.trigger("change");
    expect(ctx.setSection).toHaveBeenCalledTimes(calls);
    await w.find(".sclear").trigger("click");
    expect(ctx.setSection).toHaveBeenLastCalledWith(null);
    const empty = await profile({ a: [40, 40], b: [50, 40], halfKm: 20 });
    expect(empty.w.findAll(".hypo")).toHaveLength(0);
    expect(empty.w.find(".cap").text()).toBe("No events with a depth within ±20 km of the line.");
    expect(empty.w.find(".cap").classes()).toContain("note");
    empty.w.unmount();
    w.unmount();
  });

  it("marks the corridor's volcanoes at the surface on Active Earth", async () => {
    const { ctx, w } = await profile(eq, true);
    ctx.volcanoes.volcanoes.value = [
      ...ctx.volcanoes.volcanoes.value,
      volcano({ number: 777, name: "Ridge Cone", lon: 3, lat: 0.1 }),
    ];
    await nextTick();
    const volcs = w.findAll(".volc");
    expect(volcs.map((v) => v.find("text").text())).toEqual(["Ridge Cone"]);
    expect(volcs[0]?.find("text").attributes("y")).toBe("28");
    ctx.volcanoes.volcanoes.value = [
      ...ctx.volcanoes.volcanoes.value,
      volcano({ number: 778, name: "Twin Cone", lon: 3.2, lat: 0.1 }),
    ];
    await nextTick();
    expect(w.findAll(".volc text").map((t) => t.attributes("y"))).toEqual(["28", "17"]);
    await volcs[0]?.trigger("click");
    expect(ctx.selectVolcano).toHaveBeenCalledWith(777);
    await volcs[0]?.trigger("keydown", { key: "Enter" });
    expect(ctx.selectVolcano).toHaveBeenCalledTimes(2);
    const plain = await profile(eq, false);
    expect(plain.w.findAll(".volc")).toHaveLength(0);
    plain.w.unmount();
    w.unmount();
  });
});
