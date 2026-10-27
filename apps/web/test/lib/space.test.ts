import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSpaceStore,
  DEFAULT_WINDOW,
  HISTORY_START,
  isLongRange,
  isWindowId,
  LONG_INTERVAL_MS,
  LONG_RANGE_MS,
  MAX_RANGE_MS,
  parseSpaceRange,
  rangeBounds,
  routeInstant,
  spaceRangeQuery,
  windowLabel,
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
    expect(parseSpaceRange({ from: "1900-01-01T00:00Z", to: "2026-06-01T00:00Z" }).kind).toBe(
      "window",
    );
    // five years is a fine fixed range now
    expect(parseSpaceRange({ from: "2020-01-01T00:00Z", to: "2025-01-01T00:00Z" }).kind).toBe(
      "fixed",
    );
    expect(parseSpaceRange({ from: "2026-10-01T00:00Z" }).kind).toBe("window");
    expect(parseSpaceRange({ from: "", to: "2026-10-02T00:00Z" }).kind).toBe("window");
    expect(parseSpaceRange({ from: "soon", to: "2026-10-02T00:00Z" }).kind).toBe("window");
    expect(parseSpaceRange({ from: ["a"], to: "2026-10-02T00:00Z" }).kind).toBe("window");
    expect(isWindowId("30d")).toBe(true);
    expect(isWindowId("all")).toBe(true);
    expect(isWindowId(7)).toBe(false);
    expect(MAX_RANGE_MS).toBe(36_525 * 86_400_000);
    expect(LONG_RANGE_MS).toBe(93 * 86_400_000);
    // exactly 93 days is still short; a second more is long
    expect(isLongRange(new Date("2026-07-12T11:59:59Z"), NOW)).toBe(true);
    expect(isLongRange(new Date("2026-07-12T12:00:00Z"), NOW)).toBe(false);
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
    for (const w of WINDOWS) {
      expect(windowMs(w.id, NOW)).toBe(w.ms ?? NOW.getTime() - HISTORY_START.getTime());
    }
    for (const w of WINDOWS) expect(windowLabel(w.id)).toBe(w.label);
    expect(rangeBounds({ kind: "window", id: "all" }, NOW)).toEqual({
      from: new Date("1932-01-01T00:00:00Z"),
      to: NOW,
    });
    expect(rangeBounds({ kind: "window", id: "1y" }, NOW).from).toEqual(
      new Date(NOW.getTime() - 365.25 * 86_400_000),
    );
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
    expect(store.lastWindow.value).toBe("24h");
    store.setRange({ kind: "window", id: "6h" });
    expect(store.lastWindow.value).toBe("6h");
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
    expect(store.lastWindow.value).toBe("6h");
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

  it("polls a long range every ten minutes and a short one every minute again", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const d = doc();
    const store = createSpaceStore(api, () => NOW, { intervalMs: 60_000, doc: d });
    expect(LONG_INTERVAL_MS).toBe(600_000);
    store.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.spaceNow).toHaveBeenCalledTimes(2);
    store.setRange({ kind: "window", id: "11y" });
    await Promise.resolve();
    expect(api.spaceNow).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(599_000);
    expect(api.spaceNow).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.spaceNow).toHaveBeenCalledTimes(4);
    store.setRange({ kind: "window", id: "6h" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.spaceNow).toHaveBeenCalledTimes(6);
    // a range change while hidden loads once but starts no timer
    d.hidden = true;
    d.fire();
    store.setRange({ kind: "window", id: "7d" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.spaceNow).toHaveBeenCalledTimes(7);
    store.stop();
  });

  it("loads the Sun frames with each load and keeps them through a failed refresh", async () => {
    const api = fakeApi();
    const store = createSpaceStore(api, () => NOW, { intervalMs: 1e9, doc: doc() });
    expect(store.sun.value).toBeNull();
    await store.load();
    expect(store.sun.value?.frames).toHaveLength(7);
    expect(store.sun.value?.frames[6]).toEqual({ key: "c3", time: null, bytes: 45_000 });
    vi.mocked(api.sunFrames).mockRejectedValueOnce(new Error("sun down"));
    await store.load();
    await Promise.resolve();
    expect(store.error.value).toBeNull();
    expect(store.sun.value?.frames).toHaveLength(7);
    expect(api.sunFrames).toHaveBeenCalledTimes(2);
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
