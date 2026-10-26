import { AURORA_CELLS, auroraIndex } from "@tectonic/shared";
import { describe, expect, it } from "vitest";
import {
  dayKey,
  kpMaxByDay,
  parseAlerts,
  parseAuroraFrame,
  parseDst,
  parseFlares,
  hemiPowerSamples,
  parseHemiPower,
  parseKp1m,
  parseKp3h,
  parseMag,
  parseProtons,
  parseScales,
  parseTime,
  parseWind,
  parseXrays,
  scaleNumber,
  withPower,
} from "../../src/space/parse.js";
import {
  alerts,
  aurora,
  dst,
  hemiPower,
  flares,
  kp1m,
  kp3h,
  kpForecast,
  mag,
  protons,
  scales,
  wind,
  xrays,
} from "../support/space-stub.js";

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

describe("parseTime", () => {
  it("reads SWPC's zone-less stamps, GOES's Z stamps and the alerts' spaced form as UTC", () => {
    expect(iso(parseTime("2026-10-25T03:13:00"))).toBe("2026-10-25T03:13:00.000Z");
    expect(iso(parseTime("2026-10-25T03:13:02Z"))).toBe("2026-10-25T03:13:02.000Z");
    expect(iso(parseTime("2026-10-24 09:04:23.307"))).toBe("2026-10-24T09:04:23.307Z");
    expect(iso(parseTime("2026-10-25T03:13:00+02:00"))).toBe("2026-10-25T01:13:00.000Z");
    expect(iso(parseTime("2026-10-25"))).toBe("2026-10-25T00:00:00.000Z");
    expect(parseTime("soon")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });
});

describe("series parsers", () => {
  it("reads Kp, Dst and skips rows without a value or with a bad time", () => {
    const k1 = parseKp1m(kp1m);
    expect(k1).toHaveLength(6);
    expect(k1[0]).toEqual({
      series: "kp_1m",
      time: new Date("2026-10-25T03:39:00Z"),
      source: "swpc",
      value: 0,
    });
    const k3 = parseKp3h(kp3h);
    expect(k3).toHaveLength(6);
    expect(k3[5]?.value).toBe(0.67);
    expect(parseDst(dst).map((s) => s.value)).toEqual([9, 12, 14, 9, 7]);
    expect(parseDst(dst)[0]?.source).toBe("kyoto");
    expect(
      parseKp3h([
        { time_tag: "2026-10-25T00:00:00", Kp: null },
        { time_tag: "2026-10-25T03:00:00" },
        { time_tag: "never", Kp: 2 },
        { time_tag: "2026-10-25T06:00:00", Kp: Number.NaN },
      ]),
    ).toEqual([]);
  });

  it("keeps only the active spacecraft's solar wind rows, named by spacecraft", () => {
    const m = parseMag(mag);
    expect(m.map((s) => s.series)).toEqual(["bz_gsm", "bz_gsm", "bz_gsm", "bt", "bt", "bt"]);
    expect(m.every((s) => s.source === "SOLAR1")).toBe(true);
    expect(m.find((s) => s.series === "bz_gsm")?.value).toBe(1.38);
    expect(m.find((s) => s.series === "bt")?.value).toBe(3.14);
    const w = parseWind(wind);
    expect(w.map((s) => s.series)).toEqual([
      "speed",
      "speed",
      "speed",
      "density",
      "density",
      "density",
    ]);
    expect(w.every((s) => s.source === "SOLAR1")).toBe(true);
    expect(w[0]).toMatchObject({ time: new Date("2026-10-25T03:41:00Z"), value: 347.1 });
  });

  it("splits GOES rows by channel and names the satellite", () => {
    const x = parseXrays(xrays);
    expect(x.filter((s) => s.series === "xray_long")).toHaveLength(3);
    expect(x.filter((s) => s.series === "xray_short")).toHaveLength(3);
    expect(x[0]).toMatchObject({ source: "GOES-18", time: new Date("2026-10-25T03:43:00Z") });
    const p = parseProtons(protons);
    expect(p.map((s) => s.series)).toEqual(["p10", "p10", "p100", "p100"]);
    expect(p[0]?.value).toBeCloseTo(0.26, 2);
  });
});

describe("record parsers", () => {
  it("reads flares with an open end, alerts, and the scales with Kp maxima by day", () => {
    const f = parseFlares(flares);
    expect(f).toHaveLength(3);
    expect(f[0]).toEqual({
      beginTime: new Date("2026-10-24T04:11:00Z"),
      maxTime: new Date("2026-10-24T04:18:00Z"),
      endTime: new Date("2026-10-24T04:21:00Z"),
      beginClass: "B5.3",
      maxClass: "B7.5",
      endClass: "B6.0",
      maxXrlong: 7.594919111397758e-7,
      satellite: 18,
    });
    expect(f[2]).toMatchObject({ endTime: null, endClass: null });
    expect(
      parseFlares([
        { begin_time: "bad" },
        { begin_time: "2026-10-24T00:00:00Z", begin_class: "", max_xrlong: null, satellite: null },
      ]),
    ).toEqual([
      {
        beginTime: new Date("2026-10-24T00:00:00Z"),
        maxTime: null,
        endTime: null,
        beginClass: null,
        maxClass: null,
        endClass: null,
        maxXrlong: null,
        satellite: null,
      },
    ]);

    const a = parseAlerts(alerts);
    expect(a).toHaveLength(4);
    expect(a[1]).toMatchObject({
      productId: "K04A",
      issueTime: new Date("2026-10-23T19:55:04.007Z"),
    });
    expect(a[1]?.message).toContain("ALERT: Geomagnetic K-index of 4");
    expect(parseAlerts([{ product_id: "X", issue_datetime: "yesterday", message: "" }])).toEqual(
      [],
    );

    const maxima = kpMaxByDay(kpForecast);
    expect(maxima.get("2026-10-24")).toBe(1.67);
    expect(maxima.get("2026-10-25")).toBe(4);
    expect(maxima.get("2026-10-26")).toBe(3);
    expect(maxima.get("2026-10-27")).toBe(1.67);
    expect(
      kpMaxByDay([
        { time_tag: "bad", kp: 9, observed: "predicted" },
        { time_tag: "2026-10-28T00:00:00", kp: null, observed: "predicted" },
      ]).size,
    ).toBe(0);

    const rows = parseScales(scales, maxima);
    expect(rows.map((r) => [dayKey(r.day), r.kind])).toEqual([
      ["2026-10-24", "observed"],
      ["2026-10-25", "observed"],
      ["2026-10-25", "predicted"],
      ["2026-10-26", "predicted"],
      ["2026-10-27", "predicted"],
    ]);
    expect(rows.every((r) => r.issued.toISOString() === "2026-10-25T03:46:00.000Z")).toBe(true);
    expect(rows[1]).toMatchObject({ r: 0, s: 0, g: 0, rMinorProb: null, sProb: null, kpMax: 4 });
    expect(rows[3]).toMatchObject({
      r: null,
      s: null,
      g: 0,
      rMinorProb: 10,
      rMajorProb: 1,
      sProb: 1,
      kpMax: 3,
    });
    expect(rows[4]?.kpMax).toBe(1.67);
  });

  it("yields no scales rows without today's entry, skips days that do not parse, and leaves an unknown day's Kp null", () => {
    const today = scales["0"];
    if (today === undefined) throw new Error("fixture lacks today");
    expect(parseScales({ "1": today }, new Map())).toEqual([]);
    const rows = parseScales(
      {
        "0": today,
        "1": { ...today, DateStamp: "someday" },
        "3": { ...today, DateStamp: "2026-11-01" },
      },
      new Map(),
    );
    expect(rows.map((r) => [dayKey(r.day), r.kind, r.kpMax])).toEqual([
      ["2026-10-25", "observed", null],
      ["2026-11-01", "predicted", null],
    ]);
    expect(parseScales({ "0": { ...today, TimeStamp: "noon" } }, new Map())).toEqual([]);
  });

  it("lays the aurora frame out as a byte grid, clamping and skipping off-grid triples", () => {
    const frame = parseAuroraFrame(aurora);
    expect(frame.observed).toEqual(new Date("2026-10-25T12:12:00Z"));
    expect(frame.forecast).toEqual(new Date("2026-10-25T13:30:00Z"));
    expect(frame.powerNorth).toBeNull();
    expect(frame.grid).toHaveLength(AURORA_CELLS);
    expect(frame.grid[auroraIndex(180, 69)]).toBe(17);
    expect(frame.grid[auroraIndex(0, -90)]).toBe(4);
    expect(frame.grid[auroraIndex(359, 67)]).toBe(12);
    expect(frame.grid[auroraIndex(200, 70)]).toBe(100);
    expect(frame.grid[auroraIndex(201, 70)]).toBe(3);
    expect(frame.grid[auroraIndex(10, 90)]).toBe(0);
    expect(frame.grid[auroraIndex(0, 0)]).toBe(0);
    let sum = 0;
    for (const v of frame.grid) sum += v;
    expect(sum).toBe(
      aurora.coordinates
        .filter(([lon, lat]) => lon >= 0 && lon <= 359 && lat >= -90 && lat <= 90)
        .reduce((acc, [, , v]) => acc + Math.min(100, Math.round(v)), 0),
    );
    expect(() => parseAuroraFrame({ ...aurora, "Observation Time": "soon" })).toThrow(
      "aurora frame times unreadable",
    );
    expect(() => parseAuroraFrame({ ...aurora, "Forecast Time": "later" })).toThrow();
  });

  it("reads the hemispheric power table and matches it to a frame", () => {
    const rows = parseHemiPower(hemiPower);
    expect(rows).toEqual([
      {
        observed: new Date("2026-10-25T12:02:00Z"),
        forecast: new Date("2026-10-25T13:20:00Z"),
        north: 18,
        south: 17,
      },
      {
        observed: new Date("2026-10-25T12:12:00Z"),
        forecast: new Date("2026-10-25T13:30:00Z"),
        north: 20,
        south: 19,
      },
    ]);
    expect(parseHemiPower("")).toEqual([]);
    const frame = parseAuroraFrame(aurora);
    expect(withPower(frame, rows)).toMatchObject({ powerNorth: 20, powerSouth: 19 });
    expect(withPower(frame, rows.slice(0, 1))).toBe(frame);
    expect(frame.powerNorth).toBeNull();
    expect(hemiPowerSamples(rows)).toEqual([
      { series: "hp_north", time: new Date("2026-10-25T13:20:00Z"), source: "ovation", value: 18 },
      { series: "hp_south", time: new Date("2026-10-25T13:20:00Z"), source: "ovation", value: 17 },
      { series: "hp_north", time: new Date("2026-10-25T13:30:00Z"), source: "ovation", value: 20 },
      { series: "hp_south", time: new Date("2026-10-25T13:30:00Z"), source: "ovation", value: 19 },
    ]);
    expect(hemiPowerSamples([])).toEqual([]);
  });

  it("reads scale text as numbers", () => {
    expect(scaleNumber("3")).toBe(3);
    expect(scaleNumber("10")).toBe(10);
    expect(scaleNumber(" ")).toBeNull();
    expect(scaleNumber(null)).toBeNull();
    expect(scaleNumber(undefined)).toBeNull();
    expect(scaleNumber("none")).toBeNull();
  });
});
