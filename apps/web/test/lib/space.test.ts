import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSpaceStore,
  DEFAULT_WINDOW,
  isWindowId,
  MAX_RANGE_MS,
  parseSpaceRange,
  rangeBounds,
  routeInstant,
  spaceRangeQuery,
  windowMs,
  WINDOWS,
} from "../../src/lib/space.js";
import { fakeApi } from "../support/api.js";
import { spaceNow, spaceWindow } from "../support/space.js";

const NOW = new Date("2026-10-13T12:00:00Z");

describe("space range", () => {
  it("reads a window id, defaults to 24 hours, and prefers a sane fixed range", () => {
    expect(parseSpaceRange({})).toEqual({ kind: "window", id: DEFAULT_WINDOW });
    expect(parseSpaceRange({ window: "7d" })).toEqual({ kind: "window", id: "7d" });
    expect(parseSpaceRange({ window: "2w" })).toEqual({ kind: "window", id: "24h" });
    expect(parseSpaceRange({ from: "2026-10-01T00:00Z", to: "2026-10-02T00:00Z" })).toEqual({
      kind: "fixed",
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-02T00:00:00Z"),
    });
    // reversed, equal, too long, half given or malformed ranges fall back to the window
    expect(
      parseSpaceRange({ from: "2026-10-02T00:00Z", to: "2026-10-01T00:00Z", window: "6h" }),
    ).toEqual({
      kind: "window",
      id: "6h",
    });
    expect(parseSpaceRange({ from: "2026-10-02T00:00Z", to: "2026-10-02T00:00Z" }).kind).toBe(
      "window",
    );
    expect(parseSpaceRange({ from: "2026-01-01T00:00Z", to: "2026-06-01T00:00Z" }).kind).toBe(
      "window",
    );
    expect(parseSpaceRange({ from: "2026-10-01T00:00Z" }).kind).toBe("window");
    expect(parseSpaceRange({ from: "", to: "2026-10-02T00:00Z" }).kind).toBe("window");
    expect(parseSpaceRange({ from: "soon", to: "2026-10-02T00:00Z" }).kind).toBe("window");
    expect(parseSpaceRange({ from: ["a"], to: "2026-10-02T00:00Z" }).kind).toBe("window");
    expect(isWindowId("30d")).toBe(true);
    expect(isWindowId(7)).toBe(false);
    expect(MAX_RANGE_MS).toBe(93 * 86_400_000);
  });

  it("writes the route keys, leaving the default window out, and names the bounds", () => {
    expect(spaceRangeQuery({ kind: "window", id: "24h" })).toEqual({
      window: undefined,
      from: undefined,
      to: undefined,
    });
    expect(spaceRangeQuery({ kind: "window", id: "3d" })).toEqual({
      window: "3d",
      from: undefined,
      to: undefined,
    });
    const from = new Date("2026-10-01T00:00:30Z");
    const to = new Date("2026-10-02T06:15:59Z");
    expect(spaceRangeQuery({ kind: "fixed", from, to })).toEqual({
      window: undefined,
      from: "2026-10-01T00:00Z",
      to: "2026-10-02T06:15Z",
    });
    expect(routeInstant(to)).toBe("2026-10-02T06:15Z");
    expect(rangeBounds({ kind: "fixed", from, to }, NOW)).toEqual({ from, to });
    expect(rangeBounds({ kind: "window", id: "6h" }, NOW)).toEqual({
      from: new Date("2026-10-13T06:00:00Z"),
      to: NOW,
    });
    for (const w of WINDOWS) expect(windowMs(w.id)).toBe(w.ms);
  });
});

describe("createSpaceStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const doc = (hidden = false) => {
    const listeners = new Set<() => void>();
    return {
      hidden,
      addEventListener: (_t: "visibilitychange", l: () => void) => {
        listeners.add(l);
      },
      removeEventListener: (_t: "visibilitychange", l: () => void) => {
        listeners.delete(l);
      },
      fire: () => {
        for (const l of listeners) l();
      },
      listeners,
    };
  };

  it("loads both reads for the range in force and reloads when the range changes", async () => {
    const api = fakeApi();
    const store = createSpaceStore(api, () => NOW, { intervalMs: 1e9, doc: doc() });
    expect(store.now.value).toBeNull();
    await store.load();
    expect(store.now.value?.latest.kp_1m?.value).toBe(3.67);
    expect(store.window.value?.flares).toHaveLength(1);
    expect(store.loading.value).toBe(false);
    expect(store.error.value).toBeNull();
    expect(api.spaceWindow).toHaveBeenCalledWith(
      "2026-10-12T12:00:00.000Z",
      "2026-10-13T12:00:00.000Z",
    );
    // not started: a new range is remembered but not fetched
    store.setRange({ kind: "window", id: "6h" });
    expect(api.spaceWindow).toHaveBeenCalledTimes(1);
    store.start();
    store.start();
    await Promise.resolve();
    expect(api.spaceWindow).toHaveBeenCalledTimes(2);
    expect(api.spaceWindow).toHaveBeenLastCalledWith(
      "2026-10-13T06:00:00.000Z",
      "2026-10-13T12:00:00.000Z",
    );
    const from = new Date("2026-10-01T00:00:00Z");
    const to = new Date("2026-10-01T12:00:00Z");
    store.setRange({ kind: "fixed", from, to });
    await Promise.resolve();
    expect(api.spaceWindow).toHaveBeenLastCalledWith(from.toISOString(), to.toISOString());
    store.stop();
    store.stop();
  });

  it("polls a window every interval, never a fixed range, and pauses while hidden", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const d = doc();
    const store = createSpaceStore(api, () => NOW, { intervalMs: 1000, doc: d });
    store.start();
    expect(d.listeners.size).toBe(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(api.spaceNow).toHaveBeenCalledTimes(3);
    store.setRange({ kind: "fixed", from: new Date(NOW.getTime() - 3_600_000), to: NOW });
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.spaceNow).toHaveBeenCalledTimes(4);
    store.setRange({ kind: "window", id: "24h" });
    d.hidden = true;
    d.fire();
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.spaceNow).toHaveBeenCalledTimes(5);
    d.hidden = false;
    d.fire();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.spaceNow).toHaveBeenCalledTimes(7);
    store.stop();
    expect(d.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.spaceNow).toHaveBeenCalledTimes(7);
  });

  it("records an error, keeps the last data, and drops a stale answer", async () => {
    const slow1: { resolve?: (v: ReturnType<typeof spaceWindow>) => void } = {};
    const api = fakeApi({
      spaceWindow: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              slow1.resolve = resolve;
            }),
        )
        .mockResolvedValueOnce(spaceWindow({ bucketSeconds: 60 }))
        .mockRejectedValueOnce(new Error("boom")),
      spaceNow: vi.fn().mockResolvedValue(spaceNow()),
    });
    const store = createSpaceStore(api, () => NOW, { intervalMs: 1e9, doc: doc() });
    const slow = store.load();
    expect(store.loading.value).toBe(true);
    await store.load();
    expect(store.window.value?.bucketSeconds).toBe(60);
    expect(store.loading.value).toBe(false);
    slow1.resolve?.(spaceWindow({ bucketSeconds: null }));
    await slow;
    expect(store.window.value?.bucketSeconds).toBe(60);
    await store.load();
    expect(store.error.value).toBe("boom");
    expect(store.window.value?.bucketSeconds).toBe(60);
    expect(store.loading.value).toBe(false);
  });

  it("ignores a failure that a newer load has superseded", async () => {
    const slow2: { reject?: (e: Error) => void } = {};
    const api = fakeApi({
      spaceWindow: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              slow2.reject = reject;
            }),
        )
        .mockResolvedValue(spaceWindow()),
    });
    const store = createSpaceStore(api, () => NOW, { intervalMs: 1e9, doc: doc() });
    const slow = store.load();
    await store.load();
    slow2.reject?.(new Error("late"));
    await slow;
    expect(store.error.value).toBeNull();
  });
});
