import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import BeachballImage from "../../src/components/BeachballImage.vue";
import { clearBeachballCache } from "../../src/lib/beachball.js";
import { stubCanvas } from "../support/canvas.js";
import { mech } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

describe("BeachballImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearBeachballCache();
  });
  it("renders an img sized to px and re-renders on a theme change", async () => {
    stubCanvas();
    const ctx = await makeContext();
    const w = mountWith(BeachballImage, ctx, {
      mechanism: mech(),
      px: 50,
      depthKm: 10,
      alt: "Beachball",
    });
    const img = w.find("img");
    expect(img.attributes()).toMatchObject({ width: "50", height: "50", alt: "Beachball" });
    expect(img.attributes("src")).toBe("data:1");
    clearBeachballCache();
    ctx.theme.set("dark");
    await nextTick();
    expect(w.find("img").attributes("src")).toBe("data:2");
  });
  it("renders nothing without a drawable solution", async () => {
    stubCanvas();
    const ctx = await makeContext();
    const bare = mech({
      strike1: null,
      dip1: null,
      rake1: null,
      strike2: null,
      dip2: null,
      rake2: null,
      tAzimuth: null,
    });
    const w = mountWith(BeachballImage, ctx, { mechanism: bare, px: 50, depthKm: null });
    expect(w.find("img").exists()).toBe(false);
  });
});
