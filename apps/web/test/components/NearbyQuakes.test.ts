import { describe, expect, it, vi } from "vitest";
import NearbyQuakes from "../../src/components/NearbyQuakes.vue";
import { fakeApi, listOf } from "../support/api.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { eruption, volcano, VOLCANOES } from "../support/volcanoes.js";

const etna = volcano();
const near = (over: Record<string, unknown>) =>
  event({ latitude: 37.75, longitude: 15.0, mag: 4.1, ...over });

describe("NearbyQuakes", () => {
  it("dates nearby quakes against the eruption onset, before, after and within its granule", async () => {
    const api = fakeApi({
      events: vi
        .fn()
        .mockResolvedValue(
          listOf([
            near({ id: "after", time: "2026-10-10T00:00:00Z", mag: 4.6 }),
            near({ id: "before", time: "2022-11-20T00:00:00Z", mag: 4.3 }),
            near({ id: "same", time: "2022-11-27T10:00:00Z", mag: 4.0 }),
            event({ id: "far", latitude: -20, longitude: -175, mag: 7 }),
          ]),
        ),
    });
    const ctx = await makeContext({ api, volcanoes: true });
    const w = mountWith(NearbyQuakes, ctx, { volcano: etna });
    expect(w.find(".cap").text()).toBe(
      "Relative to the eruption that began 2022-11-27, continuing · 3 in the loaded window; the largest:",
    );
    const items = w.findAll("li").map((li) => li.text());
    expect(items[0]).toContain("3 y 10 mo after onset");
    expect(items[1]).toContain("7 d before onset");
    expect(items[2]).toContain("in the onset day");
    await w.find("li button").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("after");
  });
  it("says about for a coarse onset and falls back to ago without an eruption record", async () => {
    const helens = VOLCANOES[1];
    const clearLake = VOLCANOES[4];
    if (helens === undefined || clearLake === undefined) throw new Error("fixture");
    const api = fakeApi({
      events: vi.fn().mockResolvedValue(
        listOf([
          event({
            id: "h",
            latitude: helens.lat,
            longitude: helens.lon,
            time: "2026-10-10T00:00:00Z",
          }),
          event({
            id: "c",
            latitude: clearLake.lat,
            longitude: clearLake.lon,
            time: "2026-10-10T00:00:00Z",
          }),
        ]),
      ),
    });
    const ctx = await makeContext({ api, volcanoes: true });
    const eruptionsFor = vi
      .spyOn(ctx.volcanoes, "eruptionsFor")
      .mockReturnValue([
        eruption({ startYear: 1857, startMonth: null, startDay: null, continuing: false }),
      ]);
    const h = mountWith(NearbyQuakes, ctx, { volcano: helens });
    expect(h.find(".cap").text()).toContain("began about 1857");
    expect(h.find("li").text()).toContain("169 y after onset");
    eruptionsFor.mockReturnValue([]);
    const c = mountWith(NearbyQuakes, ctx, { volcano: clearLake });
    expect(c.find(".cap").text()).toBe("1 in the loaded window; the largest:");
    expect(c.find("li").text()).toContain("3.5 d ago");
  });
});
