import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import VolcanoDetail from "../../src/components/VolcanoDetail.vue";
import { fakeApi } from "../support/api.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { kilaueaDetail, REPORTS } from "../support/volcanoes.js";

describe("VolcanoDetail", () => {
  it("opens on a selection with GVP fields, status history, eruptions and nearby earthquakes", async () => {
    const near = event({
      id: "near",
      mag: 4.2,
      latitude: 19.5,
      longitude: -155.2,
      place: "near Kilauea",
    });
    const small = event({
      id: "small",
      mag: null,
      latitude: 19.3,
      longitude: -155.4,
      place: "also near",
    });
    const far = event({ id: "far", mag: 6.0, latitude: 0, longitude: 0 });
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue({ events: [small, near, far], count: 3, truncated: false, query: {} }),
    });
    const ctx = await makeContext({ api, volcanoes: true });
    const w = mountWith(VolcanoDetail, ctx);
    expect(w.find(".detail").classes()).not.toContain("open");
    ctx.volcanoes.select(332010);
    await flushPromises();
    expect(w.find(".detail").classes()).toContain("open");
    expect(w.find(".hd .mag").text()).toBe("Kilauea");
    await w.find(".markrow button.mark").trigger("click");
    await w.find(".markrow input").trigger("keydown", { key: "Enter" });
    expect(ctx.marks.marks.value[0]).toMatchObject({
      kind: "volcano",
      ref: "332010",
      frame: "world",
      headline: "Kilauea",
      sub: "United States · Hawaii and Pacific Ocean",
    });
    expect(w.text()).toContain("United States · Hawaii and Pacific Ocean");
    expect(w.text()).toContain("Shield(s) · Shield");
    expect(w.text()).toContain("1222 m");
    expect(w.text()).toContain("2024 · Eruption Observed");
    expect(w.find("a[href*='vn=332010']").exists()).toBe(true);
    expect(w.findAll(".statuslist li")).toHaveLength(2);
    expect(w.findAll(".statuslist li")[0]?.text()).toContain("USGS Watch · Orange");
    expect(w.text()).not.toContain("Weekly report");
    expect(w.findAll("svg.strip rect")).toHaveLength(1);
    expect(w.find(".cap").text()).toContain("1 since 1800");
    expect(w.text()).toContain("2024-12-23 · VEI 0");
    expect(w.text()).toContain("2 in the loaded window");
    expect(w.findAll(".linkbtn").map((b) => b.text().split(" ")[0])).toEqual(["M4.2", "M—"]);
    await w.find(".linkbtn").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("near");
    await w.find(".close").trigger("click");
    expect(ctx.selectVolcano).toHaveBeenCalledWith(null);
    w.unmount();
  });

  it("shows the weekly report, open and queried eruption bars, and the fallbacks", async () => {
    const api = fakeApi({
      volcano: vi
        .fn()
        .mockResolvedValueOnce({ number: 211060, statuses: [], reports: REPORTS })
        .mockRejectedValueOnce(new Error("detail down"))
        .mockResolvedValue(kilaueaDetail),
    });
    const ctx = await makeContext({ api, volcanoes: true });
    const w = mountWith(VolcanoDetail, ctx);
    ctx.volcanoes.select(211060);
    await flushPromises();
    expect(w.text()).toContain("Not monitored by USGS or GeoNet");
    expect(w.text()).toContain("Weekly report");
    expect(w.find(".reportbody").text()).toContain("Strombolian activity");
    expect(w.text()).toContain("new activity");
    expect(w.text()).toContain("ongoing activity");
    const bars = w.findAll("svg.strip rect");
    expect(bars).toHaveLength(2);
    expect(bars.some((b) => b.attributes("style")?.includes("fill: none"))).toBe(true);
    expect(w.find(".cap").text()).toContain("2 since 1800");
    expect(w.find(".cap").text()).toContain("2 earlier");
    expect(w.text()).toContain("continuing");
    expect(w.text()).toContain("VEI 3?");
    expect(w.text()).toContain("~6191 BCE ± 200");
    expect(w.text()).toContain("None in the loaded window");
    ctx.volcanoes.select(321050);
    await flushPromises();
    expect(w.text()).toContain("detail down");
    const helens = w.findAll("svg.strip rect");
    expect(helens).toHaveLength(4);
    expect(helens.some((b) => b.attributes("stroke-dasharray") === "2 1")).toBe(true);
    expect(w.text()).toContain("1800 · Uncertain Eruption");
    expect(w.text()).toContain("1857 · VEI 2?");
    ctx.volcanoes.select(323010);
    await flushPromises();
    expect(w.text()).toContain("Setting unknown");
    expect(w.text()).not.toContain("Rock");
    expect(w.text()).not.toContain(" m · ");
    expect(w.text()).toContain("Summit eruption paused.");
    expect(w.text()).toContain("No eruption records");
    expect(w.text()).toContain("unknown");
    ctx.volcanoes.select(999999);
    await flushPromises();
    expect(w.text()).toContain("not in the GVP Holocene catalogue");
    expect(w.text()).toContain("Volcano 999999 is not in the Holocene catalogue");
    ctx.volcanoes.select(null);
    await flushPromises();
    expect(w.find(".detail").classes()).not.toContain("open");
    w.unmount();
  });

  it("ignores a stale answer or failure when the selection moves on", async () => {
    let release: (v: typeof kilaueaDetail) => void = () => undefined;
    let fail: (e: Error) => void = () => undefined;
    const api = fakeApi({
      volcano: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              release = r;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((_r, rej) => {
              fail = rej;
            }),
        )
        .mockResolvedValue({ number: 211060, statuses: [], reports: [] }),
    });
    const ctx = await makeContext({ api, volcanoes: true });
    const w = mountWith(VolcanoDetail, ctx);
    ctx.volcanoes.select(332010);
    await flushPromises();
    expect(w.text()).toContain("Loading");
    ctx.volcanoes.select(321050);
    await flushPromises();
    expect(w.text()).toContain("Loading");
    ctx.volcanoes.select(211060);
    await flushPromises();
    release(kilaueaDetail);
    fail(new Error("late failure"));
    await flushPromises();
    expect(w.find(".hd .mag").text()).toBe("Etna");
    expect(w.text()).toContain("Not monitored");
    expect(w.text()).not.toContain("late failure");
    w.unmount();
  });
});
