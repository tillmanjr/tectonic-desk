import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import DepthChart from "../../src/components/DepthChart.vue";
import { fakeApi } from "../support/api.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

async function chart(events: unknown[], regionId = "global") {
  const api = fakeApi({
    events: vi
      .fn()
      .mockResolvedValue({ events, count: events.length, truncated: false, query: {} }),
  });
  const ctx = await makeContext({ api, regionId });
  return { ctx, w: mountWith(DepthChart, ctx) };
}

describe("DepthChart", () => {
  it("global: scatter with the 70 and 300 km lines, counts per class, clamps deep events", async () => {
    const evs = [
      event({ id: "s", depthKm: 10, mag: 5 }),
      event({ id: "i", depthKm: 150, mag: 5.5 }),
      event({ id: "d", depthKm: 650, mag: 6 }),
      event({ id: "dd", depthKm: 900, mag: 6.2 }),
      event({ id: "n", depthKm: null, mag: 4.6 }),
      event({ id: "m", depthKm: 5, mag: null }),
    ];
    const { ctx, w } = await chart(evs);
    expect(w.findAll("line.boundary")).toHaveLength(2);
    expect(w.findAll("circle")).toHaveLength(4);
    expect(w.find(".cap").text()).toBe(
      "1 shallow, 1 intermediate, 2 deep. 1 event without a reported depth is not plotted.",
    );
    ctx.catalog.select("d");
    await nextTick();
    expect(w.findAll("circle").find((c) => c.attributes("r") === "5")).toBeDefined();
    await w.find("circle").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("s");
  });
  it("regional: no boundary lines, negative-depth caption; empty caption", async () => {
    const { w } = await chart(
      [event({ id: "a", depthKm: -0.5, mag: 3 }), event({ id: "b", depthKm: 12, mag: 2.6 })],
      "wc",
    );
    expect(w.findAll("line.boundary")).toHaveLength(0);
    expect(w.find(".cap").text()).toBe(
      "Crustal seismicity; 1 event has negative depth (above the datum, as reported by the network).",
    );
    const two = await chart(
      [
        event({ id: "a", depthKm: -0.5, mag: 3 }),
        event({ id: "b", depthKm: -1, mag: 2.6 }),
        event({ id: "c", depthKm: null, mag: 2.6 }),
        event({ id: "d", depthKm: null, mag: 2.7 }),
      ],
      "wc",
    );
    expect(two.w.find(".cap").text()).toBe(
      "Crustal seismicity; 2 events have negative depth (above the datum, as reported by the network). 2 events without a reported depth are not plotted.",
    );
    const empty = await chart([], "wc");
    expect(empty.w.find(".cap").text()).toBe("No events in this window.");
    expect(empty.w.find("svg").attributes("viewBox")).toBe("0 0 520 180");
  });
});
