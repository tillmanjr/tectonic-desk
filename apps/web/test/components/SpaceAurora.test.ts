import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import SpaceAurora from "../../src/components/SpaceAurora.vue";
import { resetBasemapCache } from "../../src/lib/basemap-cache.js";
import { auroraMeta } from "../support/aurora.js";
import { makeContext, mountWith } from "../support/mount.js";
import { stubWorld } from "../support/world.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("SpaceAurora", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetBasemapCache();
  });

  it("shows both maps, the frame's reading and legend, and scrubs through the frames", async () => {
    stubWorld();
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceAurora, ctx);
    await flush();
    expect(w.find("h2").text()).toBe("Aurora ovalOVATION Prime");
    expect(w.findAll("svg.polar")).toHaveLength(2);
    expect(w.findAll("svg.polar .land")).toHaveLength(2);
    expect(w.findAll("svg.polar.north .band")).toHaveLength(5);
    expect(w.find(".times").text()).toBe("Observed 11:50 UTC · forecast for 13:05 UTC");
    expect(w.find(".power").text()).toBe("Hemispheric power N 19.9 GW · S 19.2 GW");
    const legend = w.findAll(".aulegend li");
    expect(legend.map((l) => l.text())).toEqual([
      "10%",
      "30%",
      "50%",
      "70%",
      "90%",
      "chance of aurora",
    ]);
    expect(legend[4]?.find("i").classes()).toEqual(["au-90"]);

    const slider = w.find("input");
    expect(slider.attributes("max")).toBe("2");
    expect(slider.element.value).toBe("2");
    expect(w.find(".scrub .cap").text()).toBe("10-13 11:50 UTC");
    const latest = w.find(".scrub button");
    expect(latest.attributes("disabled")).toBeDefined();

    await slider.setValue("0");
    expect(ctx.aurora.selected.value).toBe(auroraMeta(20).observed);
    await vi.waitFor(() => {
      expect(w.find(".times").text()).toBe("Observed 11:40 UTC · forecast for 12:55 UTC");
    });
    expect(ctx.api.auroraFrame).toHaveBeenLastCalledWith(auroraMeta(20).observed);
    expect(w.find("input").element.value).toBe("0");
    expect(latest.attributes("disabled")).toBeUndefined();

    // the right-hand end means following the newest again, as does Latest
    await slider.setValue("2");
    expect(ctx.aurora.selected.value).toBeNull();
    await slider.setValue("1");
    expect(ctx.aurora.selected.value).toBe(auroraMeta(15).observed);
    await latest.trigger("click");
    expect(ctx.aurora.selected.value).toBeNull();
    await vi.waitFor(() => {
      expect(w.find(".times").text()).toBe("Observed 11:50 UTC · forecast for 13:05 UTC");
    });

    ctx.zone.value = "local";
    await nextTick();
    expect(w.find(".times").text()).not.toContain("UTC");
    w.unmount();
  });

  it("reports an empty store, a null power pair, a store error and a lost basemap", async () => {
    stubWorld(false);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = await makeContext();
    const w = mountWith(SpaceAurora, ctx);
    await flush();
    expect(w.find(".note").text()).toBe("No aurora frames yet.");
    expect(w.findAll("svg.polar")).toHaveLength(0);
    expect(err).toHaveBeenCalledWith("basemap failed to load", expect.any(Error));

    ctx.aurora.frames.value = [auroraMeta(10, { powerNorth: null, powerSouth: null })];
    ctx.aurora.frame.value = {
      ...auroraMeta(10, { powerNorth: null, powerSouth: null }),
      grid: new Uint8Array(65_160),
    };
    ctx.aurora.error.value = "HTTP 503";
    await nextTick();
    expect(w.findAll("svg.polar")).toHaveLength(2);
    expect(w.findAll("svg.polar .land")).toHaveLength(0);
    expect(w.find(".power").text()).toBe("Hemispheric power N — · S —");
    expect(w.find(".bad").text()).toBe("HTTP 503");
    expect(w.find("input").attributes("max")).toBe("0");
    w.unmount();
  });
});
