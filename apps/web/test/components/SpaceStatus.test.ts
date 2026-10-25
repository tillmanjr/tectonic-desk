import { seriesRecord } from "@tectonic/shared";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import SpaceStatus from "../../src/components/SpaceStatus.vue";
import { makeContext, mountWith } from "../support/mount.js";
import { reading, spaceNow } from "../support/space.js";

describe("SpaceStatus", () => {
  it("reports the newest sample, its age and the instruments, and warns when stale", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStatus, ctx);
    const spans = w.findAll("span");
    expect(spans[0]?.text()).toBe("Live · NOAA SWPC · newest sample 12:00 UTC · 1 min ago");
    expect(spans[1]?.text()).toBe("mag SOLAR1 · plasma SOLAR1 · X-rays GOES-18");
    expect(w.find(".status").classes()).toEqual(["status"]);

    const stale = spaceNow();
    for (const r of Object.values(stale.latest)) {
      if (r !== null) r.time = "2026-10-13T11:40:00.000Z";
    }
    stale.latest.bt = null;
    ctx.space.now.value = stale;
    await nextTick();
    expect(w.find(".status").classes()).toContain("warn");
    expect(w.findAll("span")[0]?.text()).toContain("newest sample 11:40 UTC · 20 min ago");
    expect(w.findAll("span")[1]?.text()).toBe("plasma SOLAR1 · X-rays GOES-18");

    ctx.space.now.value = spaceNow({ latest: { ...seriesRecord(() => null), dst: reading(-3) } });
    await nextTick();
    expect(w.findAll("span")).toHaveLength(1);
    w.unmount();
  });

  it("covers connecting, empty and failed states", async () => {
    const ctx = await makeContext();
    const w = mountWith(SpaceStatus, ctx);
    expect(w.text()).toBe("Connecting to SWPC…");
    ctx.space.now.value = spaceNow({ latest: seriesRecord(() => null) });
    await nextTick();
    expect(w.text()).toBe("Live · NOAA SWPC · no samples yet");
    expect(w.find(".status").classes()).toContain("warn");
    ctx.space.error.value = "HTTP 503";
    await nextTick();
    expect(w.text()).toBe("SWPC data unavailable: HTTP 503");
    expect(w.find(".status").classes()).toContain("bad");
    w.unmount();
  });
});
