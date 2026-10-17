import type { ApiStatus } from "@tectonic/shared";
import { vi } from "vitest";
import type { ApiClient } from "../../src/lib/api.js";
import { event, GLOBAL, plateSegments, squareTopology, WC } from "./events.js";
import { faultsTopology } from "./faults.js";

export function status(over: Partial<ApiStatus> = {}): ApiStatus {
  return {
    generatedAt: "2026-10-13T12:00:00.000Z",
    events: {
      total: 7269,
      newest: "2026-10-13T11:50:00.000Z",
      oldest: "2026-07-15T00:00:00.000Z",
      withMechanism: 509,
    },
    mechanisms: { total: 692 },
    runs: {
      feed_day: null,
      feed_week: null,
      backfill: null,
      details: null,
      volcano_status: null,
      volcano_reports: null,
    },
    lastSuccessfulFeed: "2026-10-13T11:55:00.000Z",
    ...over,
  };
}

export function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  return {
    regions: vi.fn().mockResolvedValue([GLOBAL, WC]),
    events: vi.fn().mockResolvedValue({
      events: [event()],
      count: 1,
      truncated: false,
      query: {
        since: "2026-10-06T12:00:00.000Z",
        until: null,
        minMag: 4.5,
        bbox: null,
        limit: 2000,
      },
    }),
    event: vi.fn().mockResolvedValue({
      ...event(),
      firstSeen: "2026-10-12T05:00:00.000Z",
      lastSeen: "2026-10-12T05:00:00.000Z",
      detailCheckedUpdated: null,
      usgs: { title: "M 5.5" },
    }),
    status: vi.fn().mockResolvedValue(status()),
    geo: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve(
          name === "plates"
            ? plateSegments
            : name === "wc-qfaults"
              ? faultsTopology
              : squareTopology,
        ),
      ),
    ...over,
  };
}
