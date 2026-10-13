import { describe, expect, it, vi } from "vitest";
import FrequencyMagnitudeChart from "../../src/components/FrequencyMagnitudeChart.vue";
import { fakeApi } from "../support/api.js";
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
  return mountWith(FrequencyMagnitudeChart, await makeContext({ api }));
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
  });
  it("skips the fit with a single event and says so when empty", async () => {
    const one = await chart([4.9]);
    expect(one.find("line.fit").exists()).toBe(false);
    expect(one.find("text.bval").exists()).toBe(false);
    const empty = await chart([]);
    expect(empty.find(".cap").text()).toBe("No events in this window.");
  });
});
