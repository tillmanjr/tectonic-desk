import { describe, expect, it } from "vitest";
import { DST_FILL, GFZ_SERIES, parseGfz, parseKyotoDst } from "../../src/space/history-parse.js";
import { gfzDoc, gfzRawSchema } from "../../src/space/history-schema.js";
import { dstCsv, gfzRaw } from "../support/history-stub.js";

describe("parseGfz", () => {
  it("reads Kp with its status as the source and skips a null value", () => {
    const samples = parseGfz(gfzRaw("Kp"));
    expect(samples).toHaveLength(15);
    expect(samples.every((s) => s.series === "kp_gfz")).toBe(true);
    expect(samples[0]).toEqual({
      series: "kp_gfz",
      time: new Date("2026-09-30T00:00:00Z"),
      source: "gfz",
      value: 0.667,
    });
    // the third value of the fixture is null, so 06:00 is missing
    expect(samples.map((s) => s.time.toISOString()).includes("2026-09-30T06:00:00.000Z")).toBe(
      false,
    );
    expect(samples.filter((s) => s.source === "gfz")).toHaveLength(7);
    const pre = samples.filter((s) => s.source === "gfz-pre");
    expect(pre).toHaveLength(8);
    expect(pre[0]?.time).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(pre[7]?.value).toBe(1.667);
  });

  it("maps the daily indices to their series under the gfz source whatever their status", () => {
    expect(GFZ_SERIES).toEqual({ Kp: "kp_gfz", Ap: "ap", SN: "ssn", Fobs: "f107" });
    const ap = parseGfz(gfzRaw("Ap"));
    expect(ap.map((s) => [s.series, s.source, s.value])).toEqual([
      ["ap", "gfz", 3],
      ["ap", "gfz", 2],
      ["ap", "gfz", 3],
    ]);
    expect(ap[2]?.time).toEqual(new Date("2026-10-01T00:00:00Z"));
    const sn = parseGfz(gfzRaw("SN"));
    expect(sn.map((s) => s.value)).toEqual([20, 30, 27]);
    expect(sn.every((s) => s.series === "ssn" && s.source === "gfz")).toBe(true);
    const f = parseGfz(gfzRaw("Fobs"));
    expect(f.map((s) => s.value)).toEqual([91.9, 93.2, 92.4]);
    expect(f[0]?.series).toBe("f107");
  });

  it("skips an unparsable time and tolerates a document without statuses", () => {
    const doc = gfzDoc(
      "Fobs",
      gfzRawSchema.parse({ datetime: ["soon", "2026-10-01T00:00:00Z"], Fobs: [1, 2] }),
    );
    expect(doc.status).toBeNull();
    expect(parseGfz(doc).map((s) => s.value)).toEqual([2]);
  });

  it("refuses a document that lacks the index or misaligns its arrays", () => {
    expect(() => gfzDoc("Kp", gfzRawSchema.parse({ datetime: [] }))).toThrow(/lacks Kp/);
    expect(() =>
      gfzDoc("Ap", gfzRawSchema.parse({ datetime: ["2026-10-01T00:00:00Z"], Ap: [1, 2] })),
    ).toThrow(/2 values for 1 times/);
  });
});

describe("parseKyotoDst", () => {
  it("floors bin centres to the hour, skips the fill and malformed lines, keeps the source kyoto", () => {
    const samples = parseKyotoDst(dstCsv);
    expect(DST_FILL).toBe(99999);
    expect(samples).toHaveLength(9);
    expect(samples[0]).toEqual({
      series: "dst",
      time: new Date("1989-03-13T23:00:00Z"),
      source: "kyoto",
      value: -472,
    });
    expect(samples[2]?.value).toBe(-589);
    expect(samples.map((s) => s.time.toISOString())).not.toContain("2024-05-10T23:00:00.000Z");
    expect(samples[3]).toMatchObject({ time: new Date("2024-05-11T00:00:00Z"), value: -313 });
    expect(samples[7]).toMatchObject({ time: new Date("2026-10-25T02:00:00Z"), value: -2 });
    // a line without a version column still carries its value
    expect(samples[8]).toMatchObject({ time: new Date("2026-10-25T04:00:00Z"), value: 3 });
    expect(parseKyotoDst("")).toEqual([]);
  });
});
