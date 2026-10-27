import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import SunStrip from "../../src/components/SunStrip.vue";
import { makeContext, mountWith } from "../support/mount.js";

describe("SunStrip", () => {
  it("draws the seven frames with their times and asks to open one on click", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SunStrip, ctx);
    expect(w.find(".sectionlabel").text()).toBe("The Sun · SDO and SOHO");
    const thumbs = w.findAll(".sunthumb");
    expect(thumbs).toHaveLength(7);
    const first = thumbs[0];
    expect(first?.find("img").attributes("src")).toBe(
      "/api/space/sun/aia193/512.jpg?t=2026-10-13T11%3A45%3A00.000Z",
    );
    expect(first?.find("img").attributes("alt")).toBe("AIA 193 Å, 11:45 UTC");
    expect(first?.find("img").attributes("loading")).toBe("lazy");
    expect(first?.find(".t").text()).toBe("AIA 193 Å");
    expect(first?.find(".m").text()).toBe("11:45 UTC");
    expect(first?.attributes("title")).toContain("coronal holes");
    const c3 = thumbs[6];
    expect(c3?.find("img").attributes("src")).toBe("/api/space/sun/c3/512.jpg?t=0");
    expect(c3?.find(".m").text()).toBe("time unknown");
    await thumbs[1]?.trigger("click");
    expect(w.findComponent(SunStrip).emitted("open")).toEqual([["aia304"]]);
    ctx.zone.value = "local";
    await nextTick();
    expect(first?.find(".m").text()).toMatch(/^\d\d:\d\d /);
    ctx.space.sun.value = null;
    await nextTick();
    expect(w.findAll(".sunthumb")).toHaveLength(0);
    expect(w.find(".note").text()).toBe("No frames yet.");
    w.unmount();
  });
});
