import { describe, expect, it } from "vitest";
import {
  GEONET_NUMBERS,
  hansTime,
  parseGeonet,
  parseHans,
  parseWeeklyReport,
  tagText,
} from "../../src/volcano/parse.js";
import { geonetVal, hansElevated, hansMonitored, weeklyRss } from "../support/volcano-stub.js";

const at = new Date("2026-10-17T00:00:00Z");

describe("hansTime", () => {
  it("reads HANS's zone-less UTC stamps and rejects the rest", () => {
    expect(hansTime("2026-10-16 19:14:32")?.toISOString()).toBe("2026-10-16T19:14:32.000Z");
    expect(hansTime(" ")).toBeNull();
    expect(hansTime(null)).toBeNull();
    expect(hansTime(undefined)).toBeNull();
    expect(hansTime("yesterday")).toBeNull();
  });
});

describe("parseHans", () => {
  it("merges monitored and elevated rows by vnum, falling back to the observatory code, sorted by key", () => {
    const rows = parseHans(hansMonitored, hansElevated, at);
    expect(rows.map((r) => r.key)).toEqual([
      "284141",
      "311120",
      "311320",
      "311360",
      "312090",
      "321050",
      "332010",
      "avo",
    ]);
    const sitkin = rows.find((r) => r.key === "311120");
    expect(sitkin).toEqual({
      source: "usgs",
      key: "311120",
      number: 311120,
      name: "Great Sitkin",
      level: "WATCH",
      color: "ORANGE",
      noticeAt: new Date("2026-10-16T19:14:32Z"),
      synopsis: null,
      url: expect.stringContaining("hans-public/notice/") as unknown,
      observedAt: at,
    });
    const avo = rows.find((r) => r.key === "avo");
    expect(avo).toMatchObject({ number: null, name: "Alaskan Volcanoes", level: "NORMAL" });
    const bare = parseHans([{ volcano_name: "Nowhere" }], [], at)[0];
    expect(bare).toMatchObject({
      key: "Nowhere",
      number: null,
      level: "UNASSIGNED",
      color: null,
      noticeAt: null,
      url: null,
    });
    expect(
      parseHans([{ volcano_name: "X", vnum: "12", color_code: " " }], [], at)[0],
    ).toMatchObject({ key: "12", number: null, color: null });
  });
});

describe("parseGeonet", () => {
  it("keeps GeoNet's 0..5 levels as text, maps known ids to GVP numbers, sorted by id", () => {
    const rows = parseGeonet(geonetVal, at);
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.key)).toEqual([...rows.map((r) => r.key)].sort());
    const white = rows.find((r) => r.key === "whiteisland");
    expect(white).toEqual({
      source: "geonet",
      key: "whiteisland",
      number: 241040,
      name: "White Island",
      level: "2",
      color: "YELLOW",
      noticeAt: null,
      synopsis: expect.any(String) as unknown,
      url: "https://www.geonet.org.nz/volcano/whiteisland",
      observedAt: at,
    });
    expect(rows.find((r) => r.key === "northland")?.number).toBeNull();
    expect(Object.keys(GEONET_NUMBERS)).toHaveLength(10);
    const blank = parseGeonet(
      {
        features: [
          { properties: { volcanoID: "z", volcanoTitle: "Z", level: 0, acc: null, activity: "" } },
        ],
      },
      at,
    )[0];
    expect(blank).toMatchObject({ color: null, synopsis: null });
  });
});

describe("tagText and parseWeeklyReport", () => {
  it("extracts element text, unwrapping CDATA and ignoring malformed or empty elements", () => {
    expect(tagText("<item><title> Hi </title></item>", "title")).toBe("Hi");
    expect(tagText("<item><title><![CDATA[<b>x</b>]]></title></item>", "title")).toBe("<b>x</b>");
    expect(tagText("<item><title></title></item>", "title")).toBeNull();
    expect(tagText("<item></item>", "title")).toBeNull();
    expect(tagText("<item><title>never closed</item>", "title")).toBeNull();
    expect(tagText("<item><title", "title")).toBeNull();
  });
  it("reads entries with the number from the link, the week from the date, and a category", () => {
    const entries = parseWeeklyReport(weeklyRss, at);
    expect(entries.map((e) => [e.number, e.name, e.category])).toEqual([
      [211060, "Etna", "new"],
      [311120, "Great Sitkin", "ongoing"],
      [241100, "Ruapehu", "ongoing"],
    ]);
    const etna = entries[0];
    expect(etna?.week.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(etna?.title).toBe("Etna (Italy) - New Activity/Unrest");
    expect(etna?.body).toContain("Strombolian activity");
    expect(etna?.body).toContain("&");
    expect(etna?.url).toBe("https://volcano.si.edu/volcano.cfm?vn=211060");
    expect(etna?.fetchedAt).toBe(at);
    expect(entries[1]?.url).toBe("https://volcano.si.edu/volcano.cfm?vn=311120&vtab=Weekly");
    expect(entries[2]?.body).toBe("");
    const odd = parseWeeklyReport(
      `<item><title>(odd)</title><link>https://x/?vn=1</link><pubDate>Wed, 14 Oct 2026 23:00:00 GMT</pubDate></item>
       <item><title>No number</title><link>https://x/?q=1</link><pubDate>Wed, 14 Oct 2026 23:00:00 GMT</pubDate></item>
       <item><title>No date</title><link>https://x/?vn=2</link></item>`,
      at,
    );
    expect(odd.map((e) => e.name)).toEqual(["(odd)"]);
    expect(parseWeeklyReport("<rss></rss>", at)).toEqual([]);
  });
});
