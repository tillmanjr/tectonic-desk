import { afterEach, describe, expect, it, vi } from "vitest";
import MajorEvents from "../../src/components/MajorEvents.vue";
import { fakeApi } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, mech } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

const main = event({
  id: "main",
  mag: 7.1,
  time: "2026-10-12T00:00:00Z",
  latitude: 0,
  longitude: 0,
  alert: "red",
  tsunami: true,
  mechanisms: [mech()],
  depthKm: 12,
});
const after = event({
  id: "after",
  mag: 6.0,
  time: "2026-10-12T03:00:00Z",
  latitude: 0.3,
  longitude: 0.3,
  eventType: "quarry blast",
  depthKm: null,
});
const after2 = event({
  id: "after2",
  mag: 4.8,
  time: "2026-10-12T04:00:00Z",
  latitude: 0.2,
  longitude: 0.2,
});
const main2 = event({
  id: "main2",
  mag: 6.6,
  time: "2026-10-11T00:00:00Z",
  latitude: 40,
  longitude: 40,
});
const follower = event({
  id: "f2",
  mag: 4.7,
  time: "2026-10-11T01:00:00Z",
  latitude: 40.2,
  longitude: 40.2,
});
const small = event({ id: "small", mag: 4.6 });
const listOf = (events: unknown[]) => ({
  events,
  count: events.length,
  truncated: false,
  query: {},
});

describe("MajorEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("renders cards with beachball, pills, style and sequence note, and selects on click", async () => {
    stubCanvas();
    const api = fakeApi({
      events: vi.fn().mockResolvedValue(listOf([main, after, after2, main2, follower, small])),
    });
    const ctx = await makeContext({ api });
    const w = mountWith(MajorEvents, ctx);
    const cards = w.findAll(".mcard");
    expect(cards[0]?.findAll(".lines > .m").length).toBeGreaterThan(0);
    expect(cards[0]?.findAll(".m").length).toBe(cards[0]?.findAll(".lines > .m").length);
    expect(cards).toHaveLength(3);
    const first = cards[0]?.text().replace(/\s+/g, " ") ?? "";
    expect(first).toContain("M7.1 · 122 km W of Neiafu, Tonga");
    expect(first).toContain("PAGER red");
    expect(first).toContain("Tsunami flag");
    expect(first).toContain("2026-10-12 00:00 UTC · 36 h ago · 12 km · Oblique Normal");
    expect(first).toContain("Followed by 2 events ≥M4.5 within 150 km; largest M6.0");
    expect(cards[0]?.find("img").exists()).toBe(true);
    expect(cards[0]?.attributes("style")).toContain("--sevc");
    expect(cards[1]?.text()).toContain("Followed by 1 event ≥M4.5");
    const second = cards[2]?.text().replace(/\s+/g, " ") ?? "";
    expect(second).toContain("no solution yet");
    expect(second).toContain("quarry blast");
    expect(second).toContain("— km");
    await cards[2]?.trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("after");
  });
  it("says so when nothing qualifies", async () => {
    const api = fakeApi({ events: vi.fn().mockResolvedValue(listOf([small])) });
    const w = mountWith(MajorEvents, await makeContext({ api }));
    expect(w.text()).toContain("No events meet the threshold in this window.");
  });
});
