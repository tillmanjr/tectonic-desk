import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MagnitudeTimeChart from "../../src/components/MagnitudeTimeChart.vue";
import { fakeApi } from "../support/api.js";
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
  it("uses a local time scale when the zone is local", async () => {
    const { ctx, w } = await chart([after, main]);
    ctx.zone.value = "local";
    await nextTick();
    expect(w.findAll("circle")).toHaveLength(2);
  });
  it("uses the plain caption without a sequence and says so when empty", async () => {
    const { w } = await chart([after], "wc");
    expect(w.find(".cap").text()).toBe("Each stem is one event; colour is depth class.");
    const empty = await chart([]);
    expect(empty.w.find(".cap").text()).toBe("No events in this window.");
    expect(empty.w.findAll("circle")).toHaveLength(0);
  });
});
