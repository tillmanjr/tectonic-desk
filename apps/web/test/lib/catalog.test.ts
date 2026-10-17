import type { ApiEventList, ApiEventSummary, ApiSummaryBin } from "@tectonic/shared";
import { describe, expect, it, vi } from "vitest";
import {
  chooseFloor,
  createCatalog,
  EVENT_LIMIT,
  filterQueryFor,
  gridCellFor,
} from "../../src/lib/catalog.js";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { fakeApi, RAISED_SUMMARY, raisedApi } from "../support/api.js";
import { event, GLOBAL, WC } from "../support/events.js";

const now = () => new Date("2026-10-13T12:00:00Z");
const flush = () => new Promise((r) => setTimeout(r, 0));
const list = (id: string, truncated = false) => ({
  events: [event({ id })],
  count: 1,
  truncated,
  query: { since: "", until: null, minMag: null, bbox: null, limit: 1 },
});

const win = { since: "2026-10-01T00:00:00.000Z", until: "2026-10-05T23:59:59.999Z" };
const bin = (
  mags: Partial<ApiSummaryBin["mags"]>,
  over: Partial<ApiSummaryBin> = {},
): ApiSummaryBin => {
  const m = { lt4: 0, m4: 0, m5: 0, m6: 0, m7: 0, ...mags };
  return {
    start: "2000-01-01T00:00:00.000Z",
    count: m.lt4 + m.m4 + m.m5 + m.m6 + m.m7,
    maxMag: 6,
    mags: m,
    ...over,
  };
};

describe("filterQueryFor", () => {
  it("derives since, minMag and bbox from the preset, or the range when given", () => {
    expect(filterQueryFor(GLOBAL, now(), null, 4.5)).toEqual({
      since: "2026-10-06T12:00:00.000Z",
      minMag: 4.5,
    });
    expect(filterQueryFor(WC, now(), null, 2.5)).toEqual({
      since: "2026-09-13T12:00:00.000Z",
      minMag: 2.5,
      bbox: "-136,27,-104,53",
    });
    expect(filterQueryFor(GLOBAL, now(), win, 6)).toEqual({ ...win, minMag: 6 });
  });
});

describe("chooseFloor", () => {
  it("keeps the requested floor when the window fits", () => {
    expect(chooseFloor(4.5, [bin({ m4: 1500 }), bin({ m5: 500 })], 2000)).toBe(4.5);
    expect(chooseFloor(4.5, [], 2000)).toBe(4.5);
  });
  it("raises to the lowest whole band that fits, skipping bands below the request", () => {
    expect(chooseFloor(4.5, [bin({ m4: 2000, m5: 1000, m6: 100, m7: 1 })], 2000)).toBe(5);
    expect(chooseFloor(4.5, [bin({ m4: 2000, m5: 2000, m6: 100, m7: 1 })], 2000)).toBe(6);
    expect(chooseFloor(4.5, [bin({ m5: 2000, m6: 2000, m7: 10 })], 2000)).toBe(7);
    expect(chooseFloor(5.5, [bin({ m5: 1500, m6: 600 })], 2000)).toBe(6);
  });
  it("falls back to M7, or the request when that is higher, when nothing fits", () => {
    expect(chooseFloor(4.5, [bin({ m7: 3000 })], 2000)).toBe(7);
    expect(chooseFloor(7.5, [bin({ m7: 3000 })], 2000)).toBe(7.5);
  });
  it("sums the bands across bins", () => {
    expect(chooseFloor(4.5, RAISED_SUMMARY.bins, EVENT_LIMIT)).toBe(6);
  });
});

describe("gridCellFor", () => {
  it("uses 2° globally and 0.5° for a bounded view", () => {
    expect(gridCellFor(GLOBAL)).toBe(2);
    expect(gridCellFor(WC)).toBe(0.5);
  });
});

describe("createCatalog", () => {
  it("loads regions, then a region's events, exposing the selection", async () => {
    const api = fakeApi();
    const c = createCatalog(api, now);
    expect(() => c.requireRegion()).toThrow("no region selected");
    await c.init();
    expect(c.regions.value.map((r) => r.id)).toEqual(["global", "wc"]);
    expect(await c.setRegion("wc")).toBe(true);
    expect(c.region.value?.id).toBe("wc");
    expect(c.requireRegion().id).toBe("wc");
    expect(c.events.value).toHaveLength(1);
    expect(c.loading.value).toBe(false);
    c.select("us1");
    expect(c.selected.value?.id).toBe("us1");
    c.select("nope");
    expect(c.selected.value).toBeNull();
    expect(await c.setRegion("wc")).toBe(true);
    expect(api.events).toHaveBeenCalledTimes(1);
    expect(await c.setRegion("mars")).toBe(false);
  });
  it("filters the list and raises the floor with the magnitude minimum", async () => {
    const api = fakeApi({
      events: vi.fn().mockResolvedValue({
        events: [event({ id: "a", mag: 4.6 }), event({ id: "b", mag: 6 })],
        count: 2,
        truncated: false,
        query: {},
      }),
    });
    const c = createCatalog(api, now);
    expect(c.floor.value).toBe(0);
    await c.init();
    await c.setRegion("global");
    expect(c.filtered.value).toHaveLength(2);
    expect(c.floor.value).toBe(4.5);
    c.setFilter({ ...EMPTY_FILTER, minMag: 5 });
    expect(c.filtered.value.map((e) => e.id)).toEqual(["b"]);
    expect(c.floor.value).toBe(5);
    c.setFilter({ ...EMPTY_FILTER, minMag: 3 });
    expect(c.floor.value).toBe(4.5);
  });
  it("loads a date range beside the preset window, and reloads it with the region and on refetch", async () => {
    const api = fakeApi();
    vi.mocked(api.events).mockImplementation((q) =>
      Promise.resolve(list(q.until === undefined ? "preset" : "ranged", q.until !== undefined)),
    );
    const c = createCatalog(api, now);
    await c.init();
    await c.setRegion("global");
    const win = { since: "2026-10-01T00:00:00.000Z", until: "2026-10-05T23:59:59.999Z" };
    c.setRange(win);
    c.setRange({ ...win });
    await flush();
    expect(c.range.value).toEqual(win);
    expect(c.windowEvents.value[0]?.id).toBe("ranged");
    expect(c.filtered.value[0]?.id).toBe("ranged");
    expect(c.events.value[0]?.id).toBe("preset");
    expect(c.truncated.value).toBe(true);
    expect(api.events).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.events).mock.calls[1]?.[0]).toMatchObject(win);
    await c.refetch();
    expect(api.events).toHaveBeenCalledTimes(4);
    await c.setRegion("wc");
    expect(api.events).toHaveBeenCalledTimes(6);
    expect(c.windowEvents.value[0]?.id).toBe("ranged");
    c.setRange(null);
    expect(c.windowEvents.value[0]?.id).toBe("preset");
    expect(api.events).toHaveBeenCalledTimes(6);
  });
  it("reports a failed range load, drops stale range answers, and waits for a region", async () => {
    const api = fakeApi();
    const c = createCatalog(api, now);
    c.setRange({ since: "2026-10-01T00:00:00.000Z", until: "2026-10-02T00:00:00.000Z" });
    expect(api.events).not.toHaveBeenCalled();
    await c.init();
    await c.setRegion("global");
    expect(api.events).toHaveBeenCalledTimes(2);
    vi.mocked(api.events).mockRejectedValueOnce(new Error("range down"));
    c.setRange({ since: "2026-10-03T00:00:00.000Z", until: "2026-10-04T00:00:00.000Z" });
    await flush();
    expect(c.error.value).toBe("range down");
    expect(c.loading.value).toBe(false);
    let resolveFirst: (v: ApiEventSummary) => void = () => undefined;
    let rejectSecond: (e: Error) => void = () => undefined;
    vi.mocked(api.summary)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_, r) => {
            rejectSecond = r;
          }),
      );
    c.setRange({ since: "2026-10-05T00:00:00.000Z", until: "2026-10-06T00:00:00.000Z" });
    c.setRange({ since: "2026-10-07T00:00:00.000Z", until: "2026-10-08T00:00:00.000Z" });
    c.setRange(null);
    resolveFirst(RAISED_SUMMARY);
    rejectSecond(new Error("stale failure"));
    await flush();
    expect(c.windowEvents.value[0]?.id).toBe("us1");
    expect(c.error.value).toBeNull();
    expect(api.events).toHaveBeenCalledTimes(3);
    let resolveList: (v: ApiEventList) => void = () => undefined;
    vi.mocked(api.events).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveList = r;
        }),
    );
    c.setRange({ since: "2026-10-09T00:00:00.000Z", until: "2026-10-10T00:00:00.000Z" });
    await flush();
    c.setRange(null);
    resolveList(list("late"));
    await flush();
    expect(c.windowEvents.value[0]?.id).toBe("us1");
    expect(c.stats.value).toBeNull();
  });
  it("loads a window through the summary, listing at the requested floor when it fits", async () => {
    const api = fakeApi();
    const c = createCatalog(api, now);
    await c.init();
    await c.setRegion("global");
    expect(c.stats.value).toBeNull();
    expect(c.windowTotal.value).toBe(1);
    c.setRange(win);
    await flush();
    expect(api.summary).toHaveBeenCalledWith({ ...win, minMag: 4.5 });
    expect(vi.mocked(api.events).mock.calls[1]?.[0]).toEqual({
      ...win,
      minMag: 4.5,
      limit: EVENT_LIMIT,
    });
    expect(api.grid).not.toHaveBeenCalled();
    expect(c.stats.value).toMatchObject({ floor: 4.5, total: 1, by: "day", grid: null });
    expect(c.raised.value).toBe(false);
    expect(c.floor.value).toBe(4.5);
    expect(c.windowTotal.value).toBe(1);
  });
  it("raises the floor from the bands and loads the density grid at the requested floor", async () => {
    const api = raisedApi();
    const c = createCatalog(api, now);
    await c.init();
    await c.setRegion("wc");
    c.setRange(win);
    await flush();
    expect(vi.mocked(api.events).mock.calls[1]?.[0]).toMatchObject({ minMag: 6 });
    expect(api.grid).toHaveBeenCalledWith({
      ...win,
      minMag: 2.5,
      bbox: "-136,27,-104,53",
      cell: 0.5,
    });
    expect(c.raised.value).toBe(true);
    expect(c.floor.value).toBe(6);
    expect(c.requested.value).toBe(2.5);
    expect(c.windowTotal.value).toBe(7312);
    expect(c.stats.value?.grid?.cells).toHaveLength(2);
    expect(c.windowEvents.value[0]?.id).toBe("big");
    c.setFilter({ ...EMPTY_FILTER, minMag: 6.5 });
    expect(c.floor.value).toBe(6.5);
    await flush();
    expect(api.summary).toHaveBeenLastCalledWith({
      ...win,
      minMag: 6.5,
      bbox: "-136,27,-104,53",
    });
    expect(api.summary).toHaveBeenCalledTimes(2);
    expect(c.floor.value).toBe(7);
    c.setFilter({ ...EMPTY_FILTER, minMag: 6.5, maxDepth: 50 });
    await flush();
    expect(api.summary).toHaveBeenCalledTimes(2);
    c.setRange(null);
    expect(c.stats.value).toBeNull();
    c.setFilter({ ...EMPTY_FILTER, minMag: 7 });
    await flush();
    expect(api.summary).toHaveBeenCalledTimes(2);
  });
  it("keeps the old window and reports the error when the grid fails", async () => {
    const api = raisedApi();
    vi.mocked(api.grid).mockRejectedValueOnce(new Error("grid down"));
    const c = createCatalog(api, now);
    await c.init();
    await c.setRegion("global");
    c.setRange(win);
    await flush();
    expect(c.error.value).toBe("grid down");
    expect(c.stats.value).toBeNull();
    expect(c.range.value).toEqual(win);
    expect(c.windowEvents.value).toBe(c.events.value);
    expect(c.loading.value).toBe(false);
  });
  it("clears the selection on a region switch and keeps it on refetch", async () => {
    const api = fakeApi();
    const c = createCatalog(api, now);
    await c.init();
    await c.setRegion("global");
    c.select("us1");
    await c.refetch();
    expect(c.selectedId.value).toBe("us1");
    await c.setRegion("wc");
    expect(c.selectedId.value).toBeNull();
    expect(api.events).toHaveBeenCalledTimes(3);
  });
  it("keeps the last good list on a failed fetch and reports the error", async () => {
    const api = fakeApi();
    const c = createCatalog(api, now);
    await c.init();
    await c.setRegion("global");
    vi.mocked(api.events).mockRejectedValueOnce(new Error("down"));
    await c.refetch();
    expect(c.error.value).toBe("down");
    expect(c.events.value).toHaveLength(1);
    await c.refetch();
    expect(c.error.value).toBeNull();
  });
  it("reports a regions failure and ignores refetch without a region", async () => {
    const api = fakeApi({ regions: vi.fn().mockRejectedValue(new Error("no regions")) });
    const c = createCatalog(api, now);
    await c.init();
    expect(c.error.value).toBe("no regions");
    await c.refetch();
    expect(api.events).not.toHaveBeenCalled();
  });
  it("applies only the latest in-flight response", async () => {
    const api = fakeApi();
    let resolveFirst: (v: ApiEventList) => void = () => undefined;
    vi.mocked(api.events)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValueOnce(list("second", true));
    const c = createCatalog(api, now);
    await c.init();
    const first = c.setRegion("global");
    await c.setRegion("wc");
    expect(c.events.value[0]?.id).toBe("second");
    expect(c.truncated.value).toBe(true);
    resolveFirst(list("first"));
    await first;
    expect(c.events.value[0]?.id).toBe("second");
    expect(c.loading.value).toBe(false);
  });
  it("drops a stale failure too", async () => {
    const api = fakeApi();
    let rejectFirst: (e: Error) => void = () => undefined;
    vi.mocked(api.events).mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          rejectFirst = r;
        }),
    );
    const c = createCatalog(api, now);
    await c.init();
    const first = c.setRegion("global");
    await c.setRegion("wc");
    rejectFirst(new Error("late"));
    await first;
    expect(c.error.value).toBeNull();
  });
});
