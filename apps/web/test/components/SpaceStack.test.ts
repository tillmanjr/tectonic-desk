import { AURORA_CELLS, seriesRecord } from "@tectonic/shared";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import SpaceStack from "../../src/components/SpaceStack.vue";
import { makeContext, mountWith } from "../support/mount.js";
import { auroraMeta } from "../support/aurora.js";
import { alert, spaceWindow } from "../support/space.js";

const NOW_MS = Date.parse("2026-10-13T12:00:00Z");

describe("SpaceStack", () => {
  it("draws seven rows on one axis with bars, bands, references, ticks and alert marks", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: null });
    const rows = w.findAll(".srow");
    expect(rows.map((r) => r.classes()[1])).toEqual([
      "kp",
      "dst",
      "power",
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
    // GFZ's Kp as a step over the bars, all of it definitive here
    expect(kp?.find(".sline.kp_gfz").attributes("d")).toMatch(/^M[\d.]+,[\d.]+H/);
    expect(kp?.find(".sline.kp_gfz.pre").exists()).toBe(false);
    expect(w.findAll(".cyclemark")).toHaveLength(0);
    expect(kp?.find(".refs text").text()).toBe("G1");
    expect(rows[1]?.find(".refs line").exists()).toBe(true);
    expect(rows[1]?.find(".refs text").exists()).toBe(false);
    const power = rows[2];
    expect(power?.find(".rowlabel").text()).toBe("Hemispheric power N · S · GW");
    expect(power?.find(".sline.hp_north").attributes("d")).toMatch(/^M/);
    expect(power?.find(".sline.hp_south").attributes("d")).toMatch(/^M/);
    expect(power?.find(".refs line").exists()).toBe(false);
    expect(rows[3]?.find(".sline.bz_gsm").exists()).toBe(true);
    expect(rows[3]?.find(".sline.bt").exists()).toBe(true);
    const wind = rows[4];
    expect(wind?.find(".rightaxis").exists()).toBe(true);
    expect(wind?.find(".sline.density").exists()).toBe(true);
    expect(wind?.find(".rowlabel").text()).toBe("Speed · density · km/s · /cm³");
    const xray = rows[5];
    expect(xray?.findAll(".axis text").map((t) => t.text())).toEqual(["B", "C", "M", "X"]);
    expect(xray?.findAll(".refs text").map((t) => t.text())).toEqual(["M1 · R1", "X1 · R3"]);
    expect(xray?.findAll(".flareband")).toHaveLength(1);
    expect(xray?.find(".flareband").classes()).not.toContain("hl");
    expect(xray?.find(".flareband title").text()).toBe("M1.3");
    expect(rows[6]?.findAll(".axis text").map((t) => t.text())).toEqual([
      "10⁰",
      "10¹",
      "10²",
      "10³",
    ]);
    expect(rows[6]?.findAll(".refs text").map((t) => t.text())).toEqual(["S1", "S2", "S3"]);
    expect(rows[0]?.find(".rowunit").exists()).toBe(false);
    expect(rows[0]?.find(".rowlabel").text()).toBe("Kp");
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
      "Kp 3.67 · 3-h 4 · GFZ 4+ · Δ +⅓",
      "Dst -35",
      "N 19.5 · S 18.1",
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
    ).toEqual(["3-h 2 · GFZ 2 · Δ 0", "", "", "", "", "", ""]);
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
    expect(w.find(".cap").text()).toContain(
      "Points are 7-minute maxima (Kp, fluxes), minima (Dst, Bz) and means.",
    );
    expect(w.findAll(".axis text").some((t) => /^Oct \d+$/.test(t.text()))).toBe(true);
    const speed = w.find(".sline.speed").attributes("d") ?? "";
    expect(speed.match(/M/g)).toHaveLength(2);
    expect(speed.match(/L/g)).toHaveLength(1);
    const xray = w.find(".sline.xray_long").attributes("d") ?? "";
    expect(xray.match(/M/g)).toHaveLength(2);
    expect(xray.match(/L/g)).toBeNull();
    ctx.zone.value = "local";
    await nextTick();
    expect(w.findAll(".srow")).toHaveLength(7);
    w.unmount();
  });

  it("dashes GFZ's Kp from the preliminary instant and says so in the readout", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: null });
    const h = 3_600_000;
    ctx.space.window.value = spaceWindow({
      preliminaryKpFrom: new Date(NOW_MS - 6 * h).toISOString(),
    });
    await nextTick();
    const kp = w.find(".srow.kp");
    const solid = kp.find(".sline.kp_gfz:not(.pre)").attributes("d") ?? "";
    const pre = kp.find(".sline.kp_gfz.pre").attributes("d") ?? "";
    // five points before the instant, three from it on
    expect(solid.match(/H/g)).toHaveLength(5);
    expect(pre.match(/H/g)).toHaveLength(3);
    const rect = {
      left: 0,
      top: 0,
      width: 900,
      height: 200,
      right: 900,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => "",
    };
    const svg = w.find("svg.stacksvg");
    vi.spyOn(svg.element, "getBoundingClientRect").mockReturnValue(rect);
    await svg.trigger("pointermove", { clientX: 848 });
    expect(w.findAll(".cross text")[1]?.text()).toBe("Kp 3.67 · 3-h 4 · GFZ 4+ (prelim.) · Δ +⅓");
    // every GFZ point preliminary: no solid step at all
    ctx.space.window.value = spaceWindow({
      preliminaryKpFrom: new Date(NOW_MS - 48 * h).toISOString(),
    });
    await nextTick();
    expect(w.find(".sline.kp_gfz:not(.pre)").exists()).toBe(false);
    expect(w.find(".sline.kp_gfz.pre").exists()).toBe(true);
    // without GFZ points the readout has no difference to give
    ctx.space.window.value = spaceWindow({ samples: { ...spaceWindow().samples, kp_gfz: [] } });
    await nextTick();
    const again = w.find("svg.stacksvg");
    vi.spyOn(again.element, "getBoundingClientRect").mockReturnValue(rect);
    await again.trigger("pointermove", { clientX: 848 });
    expect(w.findAll(".cross text")[1]?.text()).toBe("Kp 3.67 · 3-h 4");
    expect(w.find(".sline.kp_gfz").exists()).toBe(false);
    w.unmount();
  });

  it("shows the long record past 93 days: GFZ bars, Dst, the Sun row and the cycle minima", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: null });
    const day = 86_400_000;
    const from = Date.parse("2008-01-01T00:00:00Z");
    const daily = (values: number[]): [number, number][] =>
      values.map((v, i) => [from + i * 365 * day, v]);
    ctx.space.window.value = spaceWindow({
      from: new Date(from).toISOString(),
      bucketSeconds: 7 * 86_400,
      samples: {
        ...seriesRecord<[number, number][]>(() => []),
        kp_gfz: daily([3, 5.67, 7.33, 2]),
        dst: daily([-20, -150, -60, -10]),
        ssn: daily([5, 80, 120, 10]),
        f107: daily([70, 150, 160, 75]),
      },
      preliminaryKpFrom: null,
    });
    await nextTick();
    const rows = w.findAll(".srow");
    expect(rows.map((r) => r.classes()[1])).toEqual(["kp", "dst", "sun"]);
    const kp = rows[0];
    expect(kp?.findAll(".kpbar")).toHaveLength(4);
    // 5.67 rounds to 6 (G2), 7.33 to 7 (G3)
    expect(kp?.findAll(".kpbar.lv2")).toHaveLength(1);
    expect(kp?.findAll(".kpbar.lv3")).toHaveLength(1);
    expect(kp?.find(".sline").exists()).toBe(false);
    expect(rows[2]?.find(".rowlabel").text()).toBe("Sunspots · F10.7 · sfu");
    expect(rows[2]?.find(".sline.ssn").exists()).toBe(true);
    expect(rows[2]?.find(".sline.f107").exists()).toBe(true);
    expect(w.findAll(".alertticks path")).toHaveLength(0);
    const cycles = w.findAll(".cyclemark");
    expect(cycles.map((c) => c.find("text").text())).toEqual(["Cycle 24", "Cycle 25"]);
    expect(w.find("svg.stacksvg").attributes("viewBox")).toBe("0 0 900 240");
    const cap = w.find(".cap").text();
    expect(cap).toContain("Points are 7-day maxima (Kp, fluxes), minima (Dst, Bz) and means.");
    expect(cap).toContain("GFZ's definitive 3-hour index");
    expect(cap).toContain(
      "Cycle 24 (Minimum Dec 2008, maximum Apr 2014); Cycle 25 (Minimum Dec 2019).",
    );
    expect(w.findAll(".axis text").some((t) => /^\d{4}$/.test(t.text()))).toBe(true);
    const svg = w.find("svg.stacksvg");
    vi.spyOn(svg.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 900,
      height: 240,
      right: 900,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => "",
    });
    await svg.trigger("pointermove", { clientX: 52 });
    const texts = w.findAll(".cross text").map((t) => t.text());
    expect(texts[0]).toBe("2008-01-01 00:00 UTC");
    expect(texts.slice(1)).toEqual(["GFZ 3", "Dst -20", "SSN 5 · F10.7 70"]);
    w.unmount();
  });

  it("marks the aurora frame on show while a past one inside the window is chosen", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceStack, ctx, { highlight: null });
    expect(w.find(".aumark").exists()).toBe(false);
    const grid = new Uint8Array(AURORA_CELLS);
    // observed two hours ago, so forecast 45 minutes ago: inside the 24-hour window
    const meta = auroraMeta(120);
    ctx.aurora.selected.value = meta.observed;
    ctx.aurora.frame.value = { ...meta, grid };
    await nextTick();
    const line = w.find(".aumark");
    expect(line.exists()).toBe(true);
    // 796 units span the day, so 45 minutes short of the right edge at 848
    expect(Number(line.attributes("x1"))).toBeCloseTo(848 - (45 / 1440) * 796, 6);
    expect(line.attributes("y1")).toBe("16");
    // following live draws nothing, nor does a frame forecast after the window or before it
    ctx.aurora.selected.value = null;
    await nextTick();
    expect(w.find(".aumark").exists()).toBe(false);
    ctx.aurora.selected.value = meta.observed;
    ctx.aurora.frame.value = { ...auroraMeta(10), grid };
    await nextTick();
    expect(w.find(".aumark").exists()).toBe(false);
    ctx.aurora.frame.value = { ...auroraMeta(26 * 60), grid };
    await nextTick();
    expect(w.find(".aumark").exists()).toBe(false);
    ctx.aurora.frame.value = null;
    await nextTick();
    expect(w.find(".aumark").exists()).toBe(false);
    ctx.aurora.frame.value = { ...meta, grid };
    ctx.space.window.value = null;
    await nextTick();
    expect(w.find(".aumark").exists()).toBe(false);
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
