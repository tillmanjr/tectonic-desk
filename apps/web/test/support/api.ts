import type {
  ApiEvent,
  ApiEventGrid,
  ApiEventList,
  ApiEventSummary,
  ApiStatus,
} from "@tectonic/shared";
import { vi } from "vitest";
import type { ApiClient } from "../../src/lib/api.js";
import { event, GLOBAL, plateSegments, squareTopology, WC } from "./events.js";
import { faultsTopology } from "./faults.js";
import {
  changeList,
  eruptionFile,
  kilaueaDetail,
  reportList,
  statusList,
  volcanoFile,
} from "./volcanoes.js";
import { fieldsFile } from "./fields.js";

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

const QUERY = {
  since: "2026-10-06T12:00:00.000Z",
  until: null,
  minMag: 4.5,
  bbox: null,
};

export function listOf(events: ApiEvent[], truncated = false): ApiEventList {
  return { events, count: events.length, truncated, query: { ...QUERY, limit: 2000 } };
}

type Band = keyof ApiEventSummary["bins"][number]["mags"];
const band = (m: number | null): Band =>
  m === null || m < 4 ? "lt4" : m < 5 ? "m4" : m < 6 ? "m5" : m < 7 ? "m6" : "m7";

/** One day bin holding every event, with bands counted from their magnitudes. */
export function summaryOf(events: ApiEvent[]): ApiEventSummary {
  const mags = { lt4: 0, m4: 0, m5: 0, m6: 0, m7: 0 };
  let maxMag: number | null = null;
  for (const e of events) {
    mags[band(e.mag)] += 1;
    if (e.mag !== null && (maxMag === null || e.mag > maxMag)) maxMag = e.mag;
  }
  const bins =
    events.length === 0
      ? []
      : [{ start: "2026-10-12T00:00:00.000Z", count: events.length, maxMag, mags }];
  return { by: "day", bins, query: QUERY };
}

/** One 2° cell per distinct event corner. */
export function gridOf(events: ApiEvent[]): ApiEventGrid {
  const cells = new Map<string, ApiEventGrid["cells"][number]>();
  for (const e of events) {
    const lat = Math.floor(e.latitude / 2) * 2;
    const lon = Math.floor(e.longitude / 2) * 2;
    const key = `${String(lat)},${String(lon)}`;
    const cell = cells.get(key) ?? { lat, lon, count: 0, maxMag: null };
    cell.count += 1;
    if (e.mag !== null && (cell.maxMag === null || e.mag > cell.maxMag)) cell.maxMag = e.mag;
    cells.set(key, cell);
  }
  return { cell: 2, cells: [...cells.values()], query: QUERY };
}

export function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  return {
    regions: vi.fn().mockResolvedValue([GLOBAL, WC]),
    events: vi.fn().mockResolvedValue(listOf([event()])),
    summary: vi.fn().mockResolvedValue(summaryOf([event()])),
    grid: vi.fn().mockResolvedValue(gridOf([event()])),
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
              : name === "volcanoes"
                ? volcanoFile
                : name === "eruptions"
                  ? eruptionFile
                  : squareTopology,
        ),
      ),
    volcanoStatus: vi.fn().mockResolvedValue(statusList),
    volcanoChanges: vi.fn().mockResolvedValue(changeList),
    volcanoReports: vi.fn().mockResolvedValue(reportList),
    volcano: vi.fn().mockResolvedValue(kilaueaDetail),
    fields: vi.fn().mockResolvedValue(fieldsFile),
    ...over,
  };
}

/** Two year bins whose bands overflow the budget at M4.5 and M5 but fit at M6 (total 7,312). */
export const RAISED_SUMMARY: ApiEventSummary = {
  by: "year",
  bins: [
    {
      start: "1964-01-01T00:00:00.000Z",
      count: 3910,
      maxMag: 8.4,
      mags: { lt4: 0, m4: 2400, m5: 1500, m6: 9, m7: 1 },
    },
    {
      start: "2026-01-01T00:00:00.000Z",
      count: 3402,
      maxMag: null,
      mags: { lt4: 0, m4: 2400, m5: 1000, m6: 2, m7: 0 },
    },
  ],
  query: QUERY,
};

export const RAISED_GRID: ApiEventGrid = {
  cell: 2,
  cells: [
    { lat: -20, lon: -176, count: 5000, maxMag: 8.4 },
    { lat: 34, lon: -120, count: 2, maxMag: null },
  ],
  query: QUERY,
};

/** An API whose window overflows the budget, so a catalog with a range set reports a raised floor of 6. */
export function raisedApi(events: ApiEvent[] = [event({ id: "big", mag: 6.4 })]): ApiClient {
  return fakeApi({
    events: vi.fn().mockResolvedValue(listOf(events)),
    summary: vi.fn().mockResolvedValue(RAISED_SUMMARY),
    grid: vi.fn().mockResolvedValue(RAISED_GRID),
  });
}
