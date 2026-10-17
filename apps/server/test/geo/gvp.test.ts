import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildGvpFiles,
  continuingSet,
  toEruption,
  toVolcano,
  type WfsCollection,
  type WfsFeature,
} from "../../src/geo/gvp.js";

const load = (name: string): WfsCollection =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/gvp/${name}.json`, import.meta.url), "utf8"),
  ) as WfsCollection;

const volcanoes = load("volcanoes");
const eruptions = load("eruptions");
const e3 = load("eruptions1960");

const feature = (
  properties: Record<string, unknown>,
  geometry: WfsFeature["geometry"] = { type: "Point", coordinates: [1, 2] },
): WfsFeature => ({ properties, geometry });

describe("toVolcano", () => {
  it("reads the GVP fields and trims blanks to null", () => {
    const etna = volcanoes.features.map(toVolcano).find((v) => v?.number === 211060);
    expect(etna).toMatchObject({
      name: "Etna",
      country: "Italy",
      region: "European Volcanic Regions",
      subregion: "Sicily Volcanic Province",
      lat: 37.748,
      lon: 14.999,
      type: "Stratovolcano(es)",
      landform: "Composite",
      lastEruptionYear: 2026,
    });
    expect(etna?.summary).toMatch(/^Mount Etna/);
    expect(typeof etna?.elevationM).toBe("number");
    const bare = toVolcano(
      feature({ Volcano_Number: 1, Volcano_Name: " X ", Country: "", Elevation: "high" }),
    );
    expect(bare).toMatchObject({
      number: 1,
      name: "X",
      country: "Unknown",
      region: "Unknown",
      subregion: null,
      elevationM: null,
      type: "Unknown",
      landform: null,
      rockType: null,
      tectonicSetting: null,
      lastEruptionYear: null,
      evidence: null,
      summary: null,
    });
  });
  it("drops features without a number, a name or a usable point", () => {
    expect(toVolcano(feature({ Volcano_Name: "No number" }))).toBeNull();
    expect(toVolcano(feature({ Volcano_Number: 1 }))).toBeNull();
    expect(toVolcano(feature({ Volcano_Number: 1, Volcano_Name: "A" }, null))).toBeNull();
    expect(
      toVolcano(
        feature({ Volcano_Number: 1, Volcano_Name: "A" }, { type: "Point", coordinates: 5 }),
      ),
    ).toBeNull();
    expect(
      toVolcano(
        feature({ Volcano_Number: 1, Volcano_Name: "A" }, { type: "Point", coordinates: ["x", 2] }),
      ),
    ).toBeNull();
    expect(
      toVolcano(
        feature({ Volcano_Number: 1, Volcano_Name: "A" }, { type: "Polygon", coordinates: [] }),
      ),
    ).toBeNull();
  });
});

describe("continuingSet and toEruption", () => {
  it("joins the since-1960 continuing flag by eruption number and reads dates with modifiers", () => {
    const set = continuingSet({
      features: [
        ...e3.features,
        feature({ Activity_ID: 99, ContinuingEruption: "True" }),
        feature({ Activity_ID: "x", ContinuingEruption: "True" }),
        feature({ ContinuingEruption: "True" }),
      ],
    });
    expect(set.has(99)).toBe(true);
    expect(set.has(22494)).toBe(false);
    const list = eruptions.features.map((f) => toEruption(f, set));
    const recent = list.find((e) => e?.number === 22494);
    expect(recent).toMatchObject({
      volcano: 211060,
      activity: "Confirmed Eruption",
      vei: 2,
      veiModifier: null,
      startYear: 2022,
      startMonth: 11,
      startDay: 27,
      endYear: 2026,
      endMonth: 1,
      endDay: 12,
      continuing: false,
    });
    const queried = list.find((e) => e?.number === 13838);
    expect(queried?.veiModifier).toBe("?");
    const uncertainDay = list.find((e) => e?.number === 13835);
    expect(uncertainDay?.startModifier).toBe("?");
    const prehistoric = toEruption(
      feature({
        Eruption_Number: 5,
        Volcano_Number: 1,
        StartDateYear: -6190,
        StartDateYearUncertainty: 200,
        StartDateYearModifier: "~",
        StartDateMonth: 0,
        StartDateDay: 0,
      }),
      new Set([5]),
    );
    expect(prehistoric).toMatchObject({
      activity: "Unknown",
      vei: null,
      startMonth: null,
      startDay: null,
      startYearUncertainty: 200,
      startModifier: "~",
      endYear: null,
      endMonth: null,
      endDay: null,
      continuing: true,
    });
  });
  it("drops eruptions without a number, a volcano or a start year", () => {
    expect(toEruption(feature({ Volcano_Number: 1, StartDateYear: 2000 }), new Set())).toBeNull();
    expect(toEruption(feature({ Eruption_Number: 1, StartDateYear: 2000 }), new Set())).toBeNull();
    expect(toEruption(feature({ Eruption_Number: 1, Volcano_Number: 1 }), new Set())).toBeNull();
  });
});

describe("buildGvpFiles", () => {
  it("writes both files sorted by number with a shared header", () => {
    const pulledAt = new Date("2026-10-17T00:00:00Z");
    const files = buildGvpFiles(volcanoes, eruptions, e3, pulledAt);
    expect(files.volcanoes.meta).toEqual({
      source: expect.stringContaining("Global Volcanism Program") as unknown,
      pulledAt: "2026-10-17T00:00:00.000Z",
      count: 3,
    });
    expect(files.volcanoes.items.map((v) => v.number)).toEqual([211060, 241040, 321050]);
    expect(files.eruptions.meta.count).toBe(8);
    const years = files.eruptions.items.map((e) => e.startYear);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });
});
