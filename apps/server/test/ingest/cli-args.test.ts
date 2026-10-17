import { describe, expect, it } from "vitest";
import { parseBackfillArgs, positiveInt } from "../../src/ingest/cli-args.js";

const NOW = new Date("2026-10-17T12:00:00Z");

describe("parseBackfillArgs", () => {
  it("accepts --days as a range ending now with the 2.5 default floor", () => {
    expect(parseBackfillArgs({ days: "10" }, NOW)).toEqual({
      from: new Date("2026-10-07T12:00:00Z"),
      to: NOW,
      minMagnitude: 2.5,
    });
  });

  it("accepts --from and --to as dates or stamps and every optional flag", () => {
    expect(
      parseBackfillArgs(
        {
          from: "1900-01-01",
          to: "1950-06-01T06:00:00Z",
          "min-magnitude": "4.5",
          bbox: "-136,27,-104,53",
          force: true,
          "skip-details": true,
          "pause-ms": "250",
        },
        NOW,
      ),
    ).toEqual({
      from: new Date("1900-01-01T00:00:00Z"),
      to: new Date("1950-06-01T06:00:00Z"),
      minMagnitude: 4.5,
      bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
      force: true,
      skipDetails: true,
      pauseMs: 250,
    });
    expect(parseBackfillArgs({ from: "2026-01-01", "all-magnitudes": true }, NOW)).toEqual({
      from: new Date("2026-01-01T00:00:00Z"),
      to: NOW,
      minMagnitude: null,
    });
  });

  it("rejects conflicting, missing and malformed values", () => {
    const bad = (v: Parameters<typeof parseBackfillArgs>[0], re: RegExp) => {
      expect(() => parseBackfillArgs(v, NOW)).toThrow(re);
    };
    bad({}, /--days or --from/);
    bad({ days: "1", from: "2026-01-01" }, /not both/);
    bad({ days: "0" }, /positive integer/);
    bad({ from: "yesterday" }, /--from must be/);
    bad({ from: "2026-01-01", to: "nope" }, /--to must be/);
    bad({ from: "2026-02-01", to: "2026-01-01" }, /--to must be after/);
    bad({ from: "2026-01-01", "min-magnitude": "big" }, /--min-magnitude/);
    bad({ from: "2026-01-01", "min-magnitude": "3", "all-magnitudes": true }, /not both/);
    bad({ from: "2026-01-01", bbox: "1,2,3" }, /--bbox must be/);
    bad({ from: "2026-01-01", bbox: "170,0,-170,10" }, /antimeridian/);
    bad({ from: "2026-01-01", "pause-ms": "-1" }, /--pause-ms/);
  });

  it("positiveInt parses or rejects", () => {
    expect(positiveInt(undefined, "x")).toBeUndefined();
    expect(positiveInt("3", "x")).toBe(3);
    expect(() => positiveInt("1.5", "--x")).toThrow(/--x must be a positive integer/);
  });
});
