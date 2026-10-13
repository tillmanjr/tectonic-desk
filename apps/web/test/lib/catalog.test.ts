import type { ApiEventList } from "@tectonic/shared";
import { describe, expect, it, vi } from "vitest";
import { createCatalog, EVENT_LIMIT, eventsQueryFor } from "../../src/lib/catalog.js";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { fakeApi } from "../support/api.js";
import { event, GLOBAL, WC } from "../support/events.js";

const now = () => new Date("2026-10-13T12:00:00Z");
const list = (id: string, truncated = false) => ({
  events: [event({ id })],
  count: 1,
  truncated,
  query: { since: "", until: null, minMag: null, bbox: null, limit: 1 },
});

describe("eventsQueryFor", () => {
  it("derives since, minMag, bbox and limit from the preset", () => {
    expect(eventsQueryFor(GLOBAL, now())).toEqual({
      since: "2026-10-06T12:00:00.000Z",
      minMag: 4.5,
      limit: EVENT_LIMIT,
    });
    expect(eventsQueryFor(WC, now())).toEqual({
      since: "2026-09-13T12:00:00.000Z",
      minMag: 2.5,
      bbox: "-136,27,-104,53",
      limit: EVENT_LIMIT,
    });
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
