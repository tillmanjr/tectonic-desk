import { AURORA_CELLS, auroraIndex as cellIndex } from "@tectonic/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuroraStore, decodeGrid, GRID_CACHE } from "../../src/lib/aurora.js";
import { fakeApi } from "../support/api.js";
import { auroraFrame, auroraIndex, auroraMeta, encodeGrid } from "../support/aurora.js";

const doc = () => {
  const listeners = new Set<() => void>();
  return {
    hidden: false,
    listeners,
    addEventListener: (_t: "visibilitychange", l: () => void) => listeners.add(l),
    removeEventListener: (_t: "visibilitychange", l: () => void) => listeners.delete(l),
    fire: () => {
      for (const l of listeners) l();
    },
  };
};

/** An API whose frame read answers each observation time with its own one-byte signature. */
function framedApi(count: number) {
  const frames = Array.from({ length: count }, (_, i) => auroraMeta((count - i) * 5));
  const api = fakeApi({
    auroraIndex: vi.fn().mockResolvedValue(auroraIndex({ frames })),
    auroraFrame: vi.fn().mockImplementation((observed: string) => {
      const i = frames.findIndex((f) => f.observed === observed);
      const grid = new Uint8Array(AURORA_CELLS);
      grid[cellIndex(0, 0)] = i;
      return Promise.resolve({ ...frames[i], grid: encodeGrid(grid) });
    }),
  });
  return { api, frames };
}

describe("decodeGrid", () => {
  it("round-trips bytes and refuses a grid of the wrong size", () => {
    const grid = new Uint8Array(AURORA_CELLS);
    grid[cellIndex(180, 67)] = 42;
    grid[AURORA_CELLS - 1] = 255;
    const back = decodeGrid(encodeGrid(grid));
    expect(back[cellIndex(180, 67)]).toBe(42);
    expect(back[AURORA_CELLS - 1]).toBe(255);
    expect(back[0]).toBe(0);
    expect(() => decodeGrid(btoa("abc"))).toThrow("aurora grid has 3 bytes, not 65160");
  });
});

describe("createAuroraStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the index and the newest grid, follows new frames, and empties with the index", async () => {
    const { api, frames } = framedApi(3);
    const store = createAuroraStore(api, { intervalMs: 1e9, doc: doc() });
    expect(store.frame.value).toBeNull();
    expect(store.bands.value).toEqual([]);
    await store.load();
    expect(store.frames.value).toHaveLength(3);
    expect(store.bands.value.map((b) => b.level)).toEqual([10, 30, 50, 70, 90]);
    expect(store.frame.value?.observed).toBe(frames[2]?.observed);
    expect(store.frame.value?.grid[cellIndex(0, 0)]).toBe(2);
    expect(store.loading.value).toBe(false);
    expect(store.error.value).toBeNull();
    expect(api.auroraFrame).toHaveBeenCalledTimes(1);
    expect(api.auroraFrame).toHaveBeenCalledWith(frames[2]?.observed);

    // the same newest frame again: nothing to fetch
    await store.load();
    expect(api.auroraFrame).toHaveBeenCalledTimes(1);

    vi.mocked(api.auroraIndex).mockResolvedValue(auroraIndex({ frames: [] }));
    await store.load();
    expect(store.frame.value).toBeNull();
    expect(store.frames.value).toEqual([]);
  });

  it("shows a selected frame from the cache or the API and returns to the newest", async () => {
    const { api, frames } = framedApi(3);
    const store = createAuroraStore(api, { intervalMs: 1e9, doc: doc() });
    await store.load();
    store.select(frames[0]?.observed ?? "");
    expect(store.loading.value).toBe(true);
    await vi.waitFor(() => {
      expect(store.frame.value?.grid[cellIndex(0, 0)]).toBe(0);
    });
    expect(store.loading.value).toBe(false);
    expect(api.auroraFrame).toHaveBeenCalledTimes(2);
    // back to the newest, which is cached
    store.select(null);
    await vi.waitFor(() => {
      expect(store.frame.value?.grid[cellIndex(0, 0)]).toBe(2);
    });
    expect(api.auroraFrame).toHaveBeenCalledTimes(2);
    // an unknown time falls back to the newest
    store.select("2020-01-01T00:00:00.000Z");
    await vi.waitFor(() => {
      expect(store.loading.value).toBe(false);
    });
    expect(store.frame.value?.observed).toBe(frames[2]?.observed);
    expect(api.auroraFrame).toHaveBeenCalledTimes(2);
  });

  it("keeps the most recent grids and refetches one that fell out", async () => {
    const { api, frames } = framedApi(GRID_CACHE + 2);
    const store = createAuroraStore(api, { intervalMs: 1e9, doc: doc() });
    await store.load();
    for (const f of frames) {
      store.select(f.observed);
      await vi.waitFor(() => {
        expect(store.frame.value?.observed).toBe(f.observed);
      });
    }
    // the newest was fetched by the load, pushed out by the scrub, and fetched again at its end
    expect(api.auroraFrame).toHaveBeenCalledTimes(GRID_CACHE + 3);
    // the first frame has fallen out too; the last one is still held
    store.select(frames[0]?.observed ?? "");
    await vi.waitFor(() => {
      expect(store.frame.value?.observed).toBe(frames[0]?.observed);
    });
    expect(api.auroraFrame).toHaveBeenCalledTimes(GRID_CACHE + 4);
    store.select(frames[GRID_CACHE + 1]?.observed ?? "");
    await vi.waitFor(() => {
      expect(store.frame.value?.observed).toBe(frames[GRID_CACHE + 1]?.observed);
    });
    expect(api.auroraFrame).toHaveBeenCalledTimes(GRID_CACHE + 4);
  });

  it("polls every interval while visible and stops with the page", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const d = doc();
    const store = createAuroraStore(api, { intervalMs: 1000, doc: d });
    store.start();
    store.start();
    expect(d.listeners.size).toBe(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(api.auroraIndex).toHaveBeenCalledTimes(3);
    expect(api.auroraFrame).toHaveBeenCalledTimes(1);
    d.hidden = true;
    d.fire();
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.auroraIndex).toHaveBeenCalledTimes(3);
    d.hidden = false;
    d.fire();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.auroraIndex).toHaveBeenCalledTimes(5);
    store.stop();
    store.stop();
    expect(d.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.auroraIndex).toHaveBeenCalledTimes(5);
  });

  it("records an error from either read, keeps the last frame, and ignores stale answers", async () => {
    const slow: { resolve?: (v: ReturnType<typeof auroraIndex>) => void } = {};
    const api = fakeApi({
      auroraIndex: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              slow.resolve = resolve;
            }),
        )
        .mockResolvedValueOnce(auroraIndex())
        .mockRejectedValueOnce(new Error("index down"))
        .mockResolvedValue(auroraIndex({ frames: [auroraMeta(5)] })),
      auroraFrame: vi
        .fn()
        .mockResolvedValueOnce(auroraFrame())
        .mockRejectedValueOnce(new Error("frame down"))
        .mockResolvedValue(auroraFrame(5, {}, new Uint8Array(AURORA_CELLS))),
    });
    const store = createAuroraStore(api, { intervalMs: 1e9, doc: doc() });
    const first = store.load();
    await store.load();
    expect(store.frame.value?.observed).toBe(auroraMeta(10).observed);
    slow.resolve?.(auroraIndex({ frames: [auroraMeta(60)] }));
    await first;
    expect(store.frames.value).toHaveLength(3);
    expect(store.error.value).toBeNull();

    await store.load();
    expect(store.error.value).toBe("index down");
    expect(store.frame.value?.observed).toBe(auroraMeta(10).observed);

    await store.load();
    expect(store.error.value).toBe("frame down");
    expect(store.frame.value?.observed).toBe(auroraMeta(10).observed);

    await store.load();
    expect(store.error.value).toBeNull();
    expect(store.frame.value?.observed).toBe(auroraMeta(5).observed);
  });

  it("drops a grid, or a failure, that a newer selection has superseded", async () => {
    const late: { resolve?: (v: ReturnType<typeof auroraFrame>) => void } = {};
    const lost: { reject?: (e: Error) => void } = {};
    const api = fakeApi({
      auroraFrame: vi
        .fn()
        .mockResolvedValueOnce(auroraFrame(10))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              late.resolve = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              lost.reject = reject;
            }),
        )
        .mockResolvedValueOnce(auroraFrame(20)),
    });
    const store = createAuroraStore(api, { intervalMs: 1e9, doc: doc() });
    await store.load();
    store.select(auroraMeta(15).observed);
    store.select(auroraMeta(20).observed);
    store.select(auroraMeta(10).observed);
    await vi.waitFor(() => {
      expect(store.frame.value?.observed).toBe(auroraMeta(10).observed);
    });
    late.resolve?.(auroraFrame(15));
    lost.reject?.(new Error("lost"));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.frame.value?.observed).toBe(auroraMeta(10).observed);
    expect(store.error.value).toBeNull();
    expect(store.loading.value).toBe(false);
  });
});
