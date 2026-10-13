import { describe, expect, it, vi } from "vitest";
import StatsStrip from "../../src/components/StatsStrip.vue";
import { fakeApi } from "../support/api.js";
import { event, mech } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

const listOf = (events: unknown[]) => ({
  events,
  count: events.length,
  truncated: false,
  query: {},
});

describe("StatsStrip", () => {
  it("renders the four tiles", async () => {
    const api = fakeApi({
      events: vi.fn().mockResolvedValue(
        listOf([
          event({
            id: "a",
            mag: 6.2,
            depthKm: 10,
            time: "2026-10-13T01:00:00Z",
            mechanisms: [mech()],
            place: "Tonga",
          }),
          event({ id: "b", mag: 4.6, depthKm: 523.4, time: "2026-10-08T00:00:00Z", place: "Fiji" }),
        ]),
      ),
    });
    const w = mountWith(StatsStrip, await makeContext({ api }));
    const tiles = w
      .findAll(".stat")
      .map((t) => [".k", ".v", ".s"].map((c) => t.find(c).text().replace(/\s+/g, " ")).join(" | "));
    expect(tiles).toEqual([
      "Events | 2 | 1 in the last 24 h",
      "Largest | M6.2 | Tonga",
      "Mechanisms | 1 | events with a solution",
      "Deepest | 523 km | Fiji",
    ]);
  });
  it("shows dashes for an empty window", async () => {
    const api = fakeApi({ events: vi.fn().mockResolvedValue(listOf([])) });
    const w = mountWith(StatsStrip, await makeContext({ api }));
    expect(w.findAll(".stat .v").map((v) => v.text())).toEqual(["0", "—", "0", "—"]);
  });
});
