import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MagnitudeTimeChart from "../../src/components/MagnitudeTimeChart.vue";
import { fakeApi, RAISED_SUMMARY, raisedApi } from "../support/api.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

const main = event({
  id: "main",
  mag: 7.2,
  time: "2026-10-10T00:00:00Z",
  latitude: 0,
  longitude: 0,
  place: "100 km S of Somewhere, Tonga",
});
const after = event({
  id: "after",
  mag: 5.0,
  time: "2026-10-10T05:00:00Z",
  latitude: 0.5,
  longitude: 0,
});
const other = event({ id: "other", mag: null, time: "2026-10-11T00:00:00Z" });
const small = event({ id: "small", mag: 4.6, time: "2026-10-12T00:00:00Z" });
const century = { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" };

async function chart(events: unknown[], regionId = "global") {
  const api = fakeApi({
    events: vi
      .fn()
      .mockResolvedValue({ events, count: events.length, truncated: false, query: {} }),
  });
  const ctx = await makeContext({ api, regionId });
  return { ctx, w: mountWith(MagnitudeTimeChart, ctx) };
}

describe("MagnitudeTimeChart", () => {
  it("draws a stem and circle per event with a magnitude, highlights the selection and selects on click", async () => {
    const { ctx, w } = await chart([after, main, small, other]);
    expect(w.findAll("line.stem")).toHaveLength(3);
    expect(w.findAll("circle")).toHaveLength(3);
    expect(w.find(".cap").text()).toBe(
      "The M7.2 Somewhere, Tonga event and its 1 following events within 150 km account for 50% of this window.",
    );
    ctx.catalog.select("main");
    await nextTick();
    expect(w.findAll("circle").find((c) => c.attributes("r") === "5")).toBeDefined();
    await w.find("circle").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("small");
  });
  it("ends the axis at the date range's last day when one is set", async () => {
    const { ctx, w } = await chart([after, main]);
    const before = w.findAll(".axis text").map((t) => t.text());
    ctx.catalog.setRange({ since: "2026-10-09T00:00:00.000Z", until: "2026-10-10T23:59:59.999Z" });
    await nextTick();
    const after2 = w.findAll(".axis text").map((t) => t.text());
    expect(after2).not.toEqual(before);
    expect(after2.join(" ")).not.toContain("Oct 13");
  });
  it("uses a local time scale when the zone is local", async () => {
    const { ctx, w } = await chart([after, main]);
    ctx.zone.value = "local";
    await nextTick();
    expect(w.findAll("circle")).toHaveLength(2);
  });
  it("draws per-bin bars and maxima with era marks when the floor was raised", async () => {
    const ctx = await makeContext({ api: raisedApi(), range: century });
    const w = mountWith(MagnitudeTimeChart, ctx);
    expect(w.findAll("rect.bin")).toHaveLength(2);
    expect(w.findAll("circle.binmax")).toHaveLength(1);
    expect(w.find("circle.binmax title").text()).toBe("1964: 3,910 events, largest M8.4");
    expect(w.findAll("g.era")).toHaveLength(3);
    expect(w.findAll("g.era text").map((t) => t.text())).toEqual(["WWSSN", "PDE", "GCMT"]);
    expect(w.findAll(".axis")).toHaveLength(3);
    expect(w.find(".cap").text()).toBe(
      "Bars count events per year at M4.5+; dots are the largest in each. Dashed lines mark changes in the record, not in the Earth: 1964 (WWSSN network and ISC founded; global record complete to about M5.5–6); 1973 (NEIC PDE enters ComCat; complete to about M4.5); 1976 (Global CMT begins; Mw measured rather than proxied above about M5).",
    );
    ctx.zone.value = "local";
    await nextTick();
    expect(w.find(".cap").text()).toContain(" Bins are UTC.");
  });
  it("labels month and day bins by their start", async () => {
    for (const [by, label] of [
      ["month", "1964-01"],
      ["day", "1964-01-01"],
    ] as const) {
      const api = raisedApi();
      vi.mocked(api.summary).mockResolvedValue({ ...RAISED_SUMMARY, by });
      const w = mountWith(MagnitudeTimeChart, await makeContext({ api, range: century }));
      expect(w.find("circle.binmax title").text()).toBe(`${label}: 3,910 events, largest M8.4`);
      expect(w.find(".cap").text()).toContain(`events per ${by} at M4.5+`);
      expect(Number(w.find("rect.bin").attributes("width"))).toBeGreaterThanOrEqual(1);
    }
  });
  it("marks the eras in per-event mode too, and only when they fall in the window", async () => {
    const ctx = await makeContext({
      range: { since: "1975-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
    });
    const w = mountWith(MagnitudeTimeChart, ctx);
    expect(w.findAll("line.stem")).toHaveLength(1);
    expect(w.findAll("g.era text").map((t) => t.text())).toEqual(["GCMT"]);
    expect(w.find(".cap").text()).toContain("1976 (Global CMT begins");
    expect(w.findAll(".axis text").some((t) => /^\d{4}$/.test(t.text()))).toBe(true);
    const short = await chart([after, main]);
    expect(short.w.findAll("g.era")).toHaveLength(0);
  });
  it("uses the plain caption without a sequence and says so when empty", async () => {
    const { w } = await chart([after], "wc");
    expect(w.find(".cap").text()).toBe("Each stem is one event; colour is depth class.");
    const empty = await chart([]);
    expect(empty.w.find(".cap").text()).toBe("No events in this window.");
    expect(empty.w.findAll("circle")).toHaveLength(0);
  });
});
