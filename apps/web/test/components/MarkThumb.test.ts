import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MarkThumb from "../../src/components/MarkThumb.vue";
import { resetBasemapCache } from "../../src/lib/basemap-cache.js";
import { WC } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

describe("MarkThumb", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetBasemapCache();
  });

  it("draws the star at once and the outline when the basemap arrives", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(MarkThumb, ctx, { lon: -120, lat: 40, frame: "world", kind: "event" });
    expect(w.find("path.star").attributes("style")).toContain("--accent");
    expect(w.find("path.land").exists()).toBe(false);
    await flushPromises();
    expect(w.find("path.land").attributes("d")).toMatch(/^M/);
    w.unmount();
  });

  it("uses the regional outline for the West Coast frame and colours volcanoes", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(MarkThumb, ctx, { lon: -122, lat: 45, frame: "wc", kind: "volcano" });
    await flushPromises();
    expect(vi.mocked(ctx.api.geo)).toHaveBeenCalledWith("wc-land");
    expect(w.find("path.star").attributes("style")).toContain("--vc-recent");
    expect(w.find("path.land").exists()).toBe(true);
    w.unmount();
  });

  it("draws no star for a point the projection cannot place", async () => {
    stubWorld();
    const ctx = await makeContext();
    const w = mountWith(MarkThumb, ctx, { lon: 30, lat: 95, frame: "wc", kind: "event" });
    await flushPromises();
    expect(w.find("path.star").exists()).toBe(false);
    expect(w.find("path.land").exists()).toBe(true);
    w.unmount();
  });

  it("draws no outline when the basemap fails to load", async () => {
    stubWorld(false);
    const ctx = await makeContext();
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const w = mountWith(MarkThumb, ctx, { lon: 30, lat: 10, frame: "world", kind: "event" });
    await flushPromises();
    expect(w.find("path.star").exists()).toBe(true);
    expect(w.find("path.land").exists()).toBe(false);
    expect(err).toHaveBeenCalled();
    w.unmount();
  });

  it("falls back to the world when no West Coast preset is known, and draws nothing without regions", async () => {
    stubWorld();
    const ctx = await makeContext();
    ctx.catalog.regions.value = ctx.catalog.regions.value.filter((r) => r.bbox === null);
    const w = mountWith(MarkThumb, ctx, { lon: -122, lat: 45, frame: "wc", kind: "event" });
    await flushPromises();
    expect(vi.mocked(ctx.api.geo)).not.toHaveBeenCalledWith("wc-land");
    expect(w.find("path.land").exists()).toBe(true);
    // a region change while a load is in flight: the stale answer is dropped
    ctx.catalog.regions.value = [WC];
    await nextTick();
    ctx.catalog.regions.value = [];
    await flushPromises();
    expect(w.find("path.land").exists()).toBe(false);
    w.unmount();
  });
});
