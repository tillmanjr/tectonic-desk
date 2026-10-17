import { describe, expect, it, vi } from "vitest";
import FrequencyMagnitudeChart from "../../src/components/FrequencyMagnitudeChart.vue";
import { fakeApi, raisedApi } from "../support/api.js";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { event } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

async function chart(mags: (number | null)[], types: (string | null)[] = []) {
  const events = mags.map((mag, i) => {
    const t = types[i];
    return event({ id: String(i), mag, magType: t === undefined ? "mb" : t });
  });
  const api = fakeApi({
    events: vi
      .fn()
      .mockResolvedValue({ events, count: events.length, truncated: false, query: {} }),
  });
  const ctx = await makeContext({ api });
  return Object.assign(mountWith(FrequencyMagnitudeChart, ctx), { ctx });
}

describe("FrequencyMagnitudeChart", () => {
  it("draws incremental bars, the cumulative step line, the fit and the b-value", async () => {
    const w = await chart([4.5, 4.5, 4.6, 4.7, 4.8, 5.0, 5.3, 6.1, null], ["mb", "mww", null]);
    expect(w.findAll("rect").length).toBeGreaterThan(0);
    expect(w.find("path.cum").attributes("d")).toMatch(/^M/);
    expect(w.find("line.fit").exists()).toBe(true);
    expect(w.find("text.bval").text()).toMatch(/^b = \d\.\d\d ± \d\.\d\d$/);
    expect(w.find(".cap").text()).toContain("Mixed magnitude types (mb, mww)");
    expect(w.find(".cap").text()).toContain("Mc taken as the 4.5 catalog floor");
    w.ctx.catalog.setFilter({ ...EMPTY_FILTER, minMag: 5 });
    await w.vm.$nextTick();
    expect(w.find(".cap").text()).toContain("Mc taken as the 5 filter minimum");
    expect(w.findAll("rect").length).toBeGreaterThan(0);
  });
  it("names the window floor as Mc when the floor was raised", async () => {
    const ctx = await makeContext({
      api: raisedApi([event({ id: "x", mag: 6.4 }), event({ id: "y", mag: 7.1 })]),
      range: { since: "1900-01-01T00:00:00.000Z", until: "2026-10-13T23:59:59.999Z" },
    });
    const w = mountWith(FrequencyMagnitudeChart, ctx);
    expect(w.find(".cap").text()).toContain("Mc taken as the 6 window floor");
  });
  it("skips the fit with a single event and says so when empty", async () => {
    const one = await chart([4.9]);
    expect(one.find("line.fit").exists()).toBe(false);
    expect(one.find("text.bval").exists()).toBe(false);
    const empty = await chart([]);
    expect(empty.find(".cap").text()).toBe("No events in this window.");
  });
});
