import { seriesRecord } from "@tectonic/shared";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import SpaceStack from "../../src/components/SpaceStack.vue";
import { makeContext, mountWith } from "../support/mount.js";
import { alert, spaceWindow } from "../support/space.js";

const NOW_MS = Date.parse("2026-10-13T12:00:00Z");

describe("SpaceStack", () => {
  it("draws six rows on one axis with bars, bands, references, ticks and alert marks", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: null });
    const rows = w.findAll(".srow");
    expect(rows.map((r) => r.classes()[1])).toEqual([
      "kp",
      "dst",
      "mag",
      "wind",
      "xray",
      "protons",
    ]);
    const kp = rows[0];
    expect(kp?.findAll(".kpbar")).toHaveLength(8);
    expect(kp?.findAll(".kpbar.lv1")).toHaveLength(2);
    expect(kp?.findAll(".kpbar.lv0")).toHaveLength(6);
    expect(kp?.find(".sline.kp_1m").attributes("d")).toMatch(/^M/);
    expect(kp?.find(".sline.kp_3h").exists()).toBe(false);
    expect(kp?.find(".refs text").text()).toBe("G1");
    expect(rows[1]?.find(".refs line").exists()).toBe(true);
    expect(rows[1]?.find(".refs text").exists()).toBe(false);
    expect(rows[2]?.find(".sline.bz_gsm").exists()).toBe(true);
    expect(rows[2]?.find(".sline.bt").exists()).toBe(true);
    const wind = rows[3];
    expect(wind?.find(".rightaxis").exists()).toBe(true);
    expect(wind?.find(".sline.density").exists()).toBe(true);
    expect(wind?.find(".rowunit").text()).toBe("km/s · /cm³");
    const xray = rows[4];
    expect(xray?.findAll(".axis text").map((t) => t.text())).toEqual(["B", "C", "M", "X"]);
    expect(xray?.findAll(".refs text").map((t) => t.text())).toEqual(["M1 · R1", "X1 · R3"]);
    expect(xray?.findAll(".flareband")).toHaveLength(1);
    expect(xray?.find(".flareband").classes()).not.toContain("hl");
    expect(xray?.find(".flareband title").text()).toBe("M1.3");
    expect(rows[5]?.findAll(".axis text").map((t) => t.text())).toEqual([
      "10⁰",
      "10¹",
      "10²",
      "10³",
    ]);
    expect(rows[5]?.findAll(".refs text").map((t) => t.text())).toEqual(["S1", "S2", "S3"]);
    expect(rows[0]?.find(".rowunit").exists()).toBe(false);
    const ticks = w.findAll(".alertticks path");
    expect(ticks).toHaveLength(2);
    expect(ticks[0]?.find("title").text()).toBe(
      "11:02 UTC · WARNING: Geomagnetic K-index of 5 expected",
    );
    expect(w.find(".cap").text()).toContain("Stored samples.");
    expect(w.findAll(".axis text").some((t) => /^\d\d:\d\d$/.test(t.text()))).toBe(true);
    w.unmount();
  });

  it("lights the highlighted flare and reads every row under the pointer", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: "2026-10-13T10:30:00.000Z" });
    expect(w.find(".flareband").classes()).toContain("hl");
    const svg = w.find("svg.stacksvg");
    const spy = vi.spyOn(svg.element, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 0,
      width: 450,
      height: 200,
      right: 550,
      bottom: 200,
      x: 100,
      y: 0,
      toJSON: () => "",
    });
    expect(w.find(".cross").exists()).toBe(false);
    // the right edge of the plot is now: x = 848 of 900 → half scale → 424 px in from the left
    await svg.trigger("pointermove", { clientX: 100 + 424 });
    const cross = w.find(".cross");
    expect(cross.exists()).toBe(true);
    expect(cross.findAll("text")[0]?.text()).toBe("10-13 12:00 UTC");
    expect(cross.findAll("text")[0]?.attributes("text-anchor")).toBe("end");
    expect(
      cross
        .findAll("text")
        .slice(1)
        .map((t) => t.text()),
    ).toEqual([
      "Kp 3.67 · 3-h 4",
      "Dst -35",
      "Bz -6.2 · Bt 9.8",
      "612 · 7.1",
      "long C4.2 · short B2.0",
      "≥10 0.4 · ≥100 0.1",
    ]);
    // the left edge: an instant 24 h ago, where only the sparse series have points nearby
    await svg.trigger("pointermove", { clientX: 100 + 26 });
    expect(w.find(".cross text").attributes("text-anchor")).toBe("start");
    expect(
      w
        .findAll(".cross text")
        .slice(1)
        .map((t) => t.text()),
    ).toEqual(["3-h 2", "", "", "", "", ""]);
    await svg.trigger("pointermove", { clientX: 100 + 5 });
    expect(w.find(".cross").exists()).toBe(false);
    await svg.trigger("pointermove", { clientX: 100 + 449 });
    expect(w.find(".cross").exists()).toBe(false);
    await svg.trigger("pointermove", { clientX: 100 + 300 });
    expect(w.find(".cross").exists()).toBe(true);
    // a series without points reads nothing at any instant
    ctx.space.window.value = spaceWindow({ samples: { ...spaceWindow().samples, p100: [] } });
    await nextTick();
    const again = w.find("svg.stacksvg");
    const impl = spy.getMockImplementation();
    if (impl !== undefined)
      vi.spyOn(again.element, "getBoundingClientRect").mockImplementation(impl);
    await again.trigger("pointermove", { clientX: 100 + 424 });
    expect(w.findAll(".cross text").at(-1)?.text()).toBe("≥10 0.4");
    // the window emptying under a resting pointer takes the crosshair away with the svg
    ctx.space.window.value = spaceWindow({ samples: seriesRecord(() => []) });
    await nextTick();
    expect(w.find(".cross").exists()).toBe(false);
    ctx.space.window.value = spaceWindow();
    await nextTick();
    await w.find("svg.stacksvg").trigger("pointerleave");
    expect(w.find(".cross").exists()).toBe(false);
    w.unmount();
  });

  it("labels days on a long window, lifts the pen over gaps and zero flux, and says the bucket", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: null });
    const h = 3_600_000;
    ctx.space.window.value = spaceWindow({
      from: new Date(NOW_MS - 7 * 24 * h).toISOString(),
      bucketSeconds: 420,
      samples: {
        ...spaceWindow().samples,
        speed: [
          [NOW_MS - 10 * h, 400],
          [NOW_MS - 10 * h + 420_000, 410],
          [NOW_MS, 612],
        ],
        xray_long: [
          [NOW_MS - 2 * h, 1e-6],
          [NOW_MS - h, 0],
          [NOW_MS, 4e-6],
        ],
      },
      alerts: [
        alert({ issueTime: new Date(NOW_MS - 8 * 24 * h).toISOString() }),
        alert({ issueTime: new Date(NOW_MS + h).toISOString() }),
        alert({ issueTime: new Date(NOW_MS - h).toISOString() }),
      ],
    });
    await nextTick();
    expect(w.findAll(".alertticks path")).toHaveLength(1);
    expect(w.find(".cap").text()).toContain("Points are 7-minute means.");
    expect(w.findAll(".axis text").some((t) => /^Oct \d+$/.test(t.text()))).toBe(true);
    const speed = w.find(".sline.speed").attributes("d") ?? "";
    expect(speed.match(/M/g)).toHaveLength(2);
    expect(speed.match(/L/g)).toHaveLength(1);
    const xray = w.find(".sline.xray_long").attributes("d") ?? "";
    expect(xray.match(/M/g)).toHaveLength(2);
    expect(xray.match(/L/g)).toBeNull();
    ctx.zone.value = "local";
    await nextTick();
    expect(w.findAll(".srow")).toHaveLength(6);
    w.unmount();
  });

  it("says so when the window has no samples", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: null });
    ctx.space.window.value = spaceWindow({ samples: seriesRecord(() => []) });
    await nextTick();
    expect(w.find("svg").exists()).toBe(false);
    expect(w.find(".cap.note").text()).toBe("No samples yet.");
    ctx.space.window.value = null;
    await nextTick();
    expect(w.find(".cap.note").text()).toBe("No samples yet.");
    w.unmount();
  });
});
