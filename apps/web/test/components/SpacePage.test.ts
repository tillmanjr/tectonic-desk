import { seriesRecord } from "@tectonic/shared";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import SpacePage from "../../src/components/SpacePage.vue";
import SpaceForecast from "../../src/components/SpaceForecast.vue";
import SpaceTiles from "../../src/components/SpaceTiles.vue";
import SpaceFlares from "../../src/components/SpaceFlares.vue";
import { fakeApi } from "../support/api.js";
import { makeContext, mountWith } from "../support/mount.js";
import { flare, scalesRow, spaceNow, spaceWindow } from "../support/space.js";

describe("SpacePage", () => {
  it("renders the tiles, forecast, flares and alerts from the store", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpacePage, ctx);
    const tiles = w.findAll(".stats.space .stat");
    expect(tiles).toHaveLength(6);
    expect(tiles[0]?.find(".v").text()).toContain("3.67");
    expect(tiles[0]?.find(".s").text()).toBe("3-hour Kp 4");
    expect(tiles[0]?.find("svg.spark path").attributes("d")).toMatch(/^M/);
    expect(tiles[1]?.findAll(".sc").map((c) => c.text())).toEqual(["G1", "R0", "S0"]);
    expect(tiles[1]?.find(".s").text()).toBe("D+1 G0 · R1+ 25% · S1+ 1%");
    expect(tiles[1]?.find("svg.spark").exists()).toBe(false);
    expect(tiles[2]?.find(".v").text()).toContain("-6.2");
    expect(tiles[2]?.find(".s").text()).toBe("Bt 9.8 nT · SOLAR1");
    expect(tiles[3]?.find(".v").text()).toContain("612");
    expect(tiles[3]?.find(".s").text()).toBe("7.1 /cm³ · SOLAR1");
    expect(tiles[4]?.find(".v").text()).toContain("C4.2");
    expect(tiles[4]?.find(".s").text()).toBe("4.2e-6 W/m² · GOES-18");
    expect(tiles[4]?.find("svg.spark path").attributes("d")).toMatch(/^M/);
    expect(tiles[5]?.find(".v").text()).toContain("0.4");
    expect(tiles[5]?.find(".s").text()).toBe("≥100 MeV 0.1 pfu · GOES-18");

    const forecast = w.findAll(".forecast tbody tr");
    expect(forecast).toHaveLength(4);
    expect(forecast[0]?.text()).toContain("Today so far");
    expect(forecast[0]?.findAll(".sc").map((c) => c.text())).toEqual(["G1", "R0", "S0"]);
    expect(forecast[0]?.find("td:last-child").text()).toBe("5");
    expect(forecast[1]?.text()).toContain("Oct 13");
    expect(forecast[1]?.findAll(".sc").map((c) => c.text())).toEqual(["G2"]);
    expect(forecast[1]?.findAll(".prob").map((c) => c.text())).toEqual(["35% / 5%", "5%"]);
    expect(forecast[1]?.find("td:last-child").text()).toBe("6-");
    expect(forecast[3]?.find("td:last-child").text()).toBe("—");

    const flares = w.findAll(".flares tbody tr");
    expect(flares).toHaveLength(1);
    expect(flares[0]?.text()).toContain("M1.3");
    expect(flares[0]?.text()).toContain("40 min");
    expect(flares[0]?.text()).toContain("10-13 10:52");
    expect(w.find(".flareband.hl").exists()).toBe(false);
    await flares[0]?.trigger("mouseenter");
    expect(w.find(".flareband.hl").exists()).toBe(true);
    await flares[0]?.trigger("mouseleave");
    expect(w.find(".flareband.hl").exists()).toBe(false);
    await flares[0]?.trigger("focus");
    expect(w.find(".flareband.hl").exists()).toBe(true);
    await flares[0]?.trigger("blur");
    expect(w.find(".flareband.hl").exists()).toBe(false);
    await flares[0]?.trigger("click");
    expect(ctx.setSpaceRange).toHaveBeenCalledWith({
      kind: "fixed",
      from: new Date("2026-10-13T09:30:00Z"),
      to: new Date("2026-10-13T13:10:00Z"),
    });
    await flares[0]?.trigger("keydown.enter");
    expect(ctx.setSpaceRange).toHaveBeenCalledTimes(2);

    const alerts = w.findAll(".alertlist li");
    expect(alerts).toHaveLength(2);
    const head = alerts[0]?.find(".alerthead");
    expect(head?.text()).toContain("K05W");
    expect(head?.text()).toContain("10-13 11:02");
    expect(head?.text()).toContain("WARNING: Geomagnetic K-index of 5 expected");
    expect(alerts[0]?.find("pre").exists()).toBe(false);
    await head?.trigger("click");
    expect(alerts[0]?.find("pre").text()).toContain("Valid From: 2026 Oct 13 1100 UTC");
    expect(alerts[0]?.find("pre").text()).not.toContain("\r");
    expect(head?.attributes("aria-expanded")).toBe("true");
    await head?.trigger("click");
    expect(alerts[0]?.find("pre").exists()).toBe(false);
    w.unmount();
  });

  it("shows the empty states, the error banner and a retry", async () => {
    const api = fakeApi({
      spaceNow: vi.fn().mockResolvedValue(
        spaceNow({
          latest: seriesRecord(() => null),
          scales: [],
          latestFlare: null,
          latestAlert: null,
        }),
      ),
      spaceWindow: vi
        .fn()
        .mockResolvedValue(
          spaceWindow({ samples: seriesRecord(() => []), flares: [], alerts: [], scales: [] }),
        ),
    });
    const ctx = await makeContext({ api, space: true });
    const w = mountWith(SpacePage, ctx);
    const tiles = w.findAll(".stats.space .stat");
    expect(tiles.map((t) => t.find(".v").text())).toEqual(["—", "—", "—", "—", "—", "—"]);
    expect(tiles.map((t) => t.find(".s").text())).toEqual([
      "no 3-hour value yet",
      "no forecast yet",
      "no field reading",
      "no plasma reading",
      "no flux reading",
      "no proton reading",
    ]);
    expect(w.findAll("svg.spark")).toHaveLength(0);
    expect(w.find(".forecast .note").text()).toBe("No forecast yet.");
    expect(w.find(".flares .note").text()).toBe("No flares in this window.");
    expect(w.find(".alerts .note").text()).toBe("No alerts in this window.");
    expect(w.find(".spacestack .note").text()).toBe("No samples yet.");
    expect(w.find(".banner.error").exists()).toBe(false);
    ctx.space.error.value = "boom";
    await nextTick();
    expect(w.find(".banner.error").text()).toContain("boom");
    const before = vi.mocked(api.spaceWindow).mock.calls.length;
    await w.find(".banner.error button").trigger("click");
    expect(vi.mocked(api.spaceWindow).mock.calls.length).toBe(before + 1);
    w.unmount();
  });

  it("renders dashes before the first load lands", async () => {
    const ctx = await makeContext();
    const w = mountWith(SpacePage, ctx);
    expect(ctx.space.now.value).toBeNull();
    expect(w.findAll(".stats.space .stat .v").map((v) => v.text())).toEqual([
      "—",
      "—",
      "—",
      "—",
      "—",
      "—",
    ]);
    expect(w.find(".forecast .note").exists()).toBe(true);
    expect(w.find(".flares .note").exists()).toBe(true);
    expect(w.find(".alerts .note").exists()).toBe(true);
    w.unmount();
  });
});

describe("SpaceTiles scales edge cases", () => {
  it("marks unknown levels and copes with a forecast but no observed day", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceTiles, ctx);
    ctx.space.now.value = spaceNow({
      scales: [
        scalesRow({ g: null, r: null, s: null }),
        scalesRow({
          day: "2026-10-14T00:00:00.000Z",
          kind: "predicted",
          g: null,
          rMinorProb: null,
          sProb: null,
        }),
      ],
    });
    await nextTick();
    const tile = w.findAll(".stats.space .stat")[1];
    expect(tile?.findAll(".sc").map((c) => c.text())).toEqual(["G?", "R?", "S?"]);
    expect(tile?.find(".s").text()).toBe("D+1 G? · R1+ — · S1+ —");
    ctx.space.now.value = spaceNow({
      scales: [scalesRow({ kind: "predicted", g: 3, rMinorProb: 60, sProb: 10 })],
    });
    await nextTick();
    expect(tile?.findAll(".sc")).toHaveLength(0);
    expect(tile?.find(".v").text()).toBe("—");
    expect(tile?.find(".s").text()).toBe("D+1 G3 · R1+ 60% · S1+ 10%");
    const forecast = mountWith(SpaceForecast, ctx);
    ctx.space.now.value = spaceNow({
      scales: [
        scalesRow({ g: null, r: null, s: null, kpMax: null }),
        scalesRow({
          day: "2026-10-14T00:00:00.000Z",
          kind: "predicted",
          g: null,
          rMinorProb: null,
          rMajorProb: null,
          sProb: null,
        }),
      ],
    });
    await nextTick();
    const frows = forecast.findAll("tbody tr");
    expect(frows[0]?.findAll(".sc").map((c) => c.text())).toEqual(["—", "—", "—"]);
    expect(frows[0]?.find("td:last-child").text()).toBe("—");
    expect(frows[1]?.findAll(".prob").map((c) => c.text())).toEqual(["— / —", "—"]);
    forecast.unmount();
    // a sparkline needs two placeable points
    ctx.space.window.value = spaceWindow({
      samples: { ...spaceWindow().samples, kp_1m: [[Date.parse("2026-10-13T11:59:00Z"), 2]] },
    });
    await nextTick();
    expect(w.findAll(".stats.space .stat")[0]?.find("svg.spark").exists()).toBe(false);
    w.unmount();
  });
});

describe("SpaceFlares", () => {
  it("frames an open flare by its peak, else its start, and lists newest first", async () => {
    const ctx = await makeContext({ space: true });
    ctx.space.window.value = spaceWindow({
      flares: [
        flare({
          beginTime: "2026-10-13T09:00:00.000Z",
          maxTime: null,
          endTime: null,
          maxClass: null,
        }),
        flare({ beginTime: "2026-10-13T11:00:00.000Z", endTime: null }),
      ],
    });
    const w = mountWith(SpaceFlares, ctx, { highlight: "2026-10-13T11:00:00.000Z" });
    const rows = w.findAll("tbody tr");
    expect(rows.map((r) => r.text())).toEqual([
      "10-13 10:52M1.3in progress",
      "10-13 09:00—in progress",
    ]);
    expect(rows[0]?.classes()).toContain("hl");
    expect(rows[1]?.classes()).not.toContain("hl");
    await rows[0]?.trigger("click");
    expect(ctx.setSpaceRange).toHaveBeenLastCalledWith({
      kind: "fixed",
      from: new Date("2026-10-13T10:00:00Z"),
      to: new Date("2026-10-13T12:52:00Z"),
    });
    await rows[1]?.trigger("click");
    expect(ctx.setSpaceRange).toHaveBeenLastCalledWith({
      kind: "fixed",
      from: new Date("2026-10-13T08:00:00Z"),
      to: new Date("2026-10-13T11:00:00Z"),
    });
    w.unmount();
  });
});
