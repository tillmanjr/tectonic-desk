import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBasemapFor, resetBasemapCache } from "../../src/lib/basemap-cache.js";
import { fakeApi } from "../support/api.js";
import { GLOBAL, WC } from "../support/events.js";
import { stubWorld } from "../support/world.js";

describe("basemap cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetBasemapCache();
  });

  it("fetches each basemap once, sharing the in-flight promise, until reset", async () => {
    stubWorld();
    const api = fakeApi();
    const [a, b] = await Promise.all([loadBasemapFor(api, GLOBAL), loadBasemapFor(api, GLOBAL)]);
    expect(a).toBe(b);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const r1 = await loadBasemapFor(api, WC);
    const r2 = await loadBasemapFor(api, WC);
    expect(r1).toBe(r2);
    expect(vi.mocked(api.geo).mock.calls.filter(([n]) => n === "wc-land")).toHaveLength(1);
    resetBasemapCache();
    await loadBasemapFor(api, GLOBAL);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed load so the next call retries", async () => {
    stubWorld(false);
    const api = fakeApi();
    await expect(loadBasemapFor(api, GLOBAL)).rejects.toThrow("503");
    stubWorld();
    await expect(loadBasemapFor(api, GLOBAL)).resolves.toBeDefined();
  });
});
