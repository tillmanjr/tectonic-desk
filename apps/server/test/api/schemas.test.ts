import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/api/errors.js";
import {
  eventIdSchema,
  parseEventsFilter,
  parseEventsQuery,
  parseGridQuery,
  parseOrThrow,
  parseSummaryQuery,
  runsQuerySchema,
  toListFilter,
} from "../../src/api/schemas.js";

const NOW = new Date("2026-10-13T12:00:00Z");
const WEEK_AGO = new Date("2026-10-06T12:00:00Z");

function issuesOf(fn: () => unknown): { path: string; message: string }[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError && err.issues) return err.issues;
    throw err;
  }
  throw new Error("expected a 400");
}

describe("parseEventsQuery", () => {
  it("defaults to the last seven days and 500 rows", () => {
    expect(parseEventsQuery({}, NOW)).toEqual({
      since: WEEK_AGO,
      until: null,
      minMag: null,
      bbox: null,
      limit: 500,
    });
  });

  it("accepts date-times with offsets and plain dates", () => {
    expect(parseEventsQuery({ since: "2026-10-01T00:00:00+02:00" }, NOW).since).toEqual(
      new Date("2026-09-30T22:00:00Z"),
    );
    expect(parseEventsQuery({ since: "2026-10-01", until: "2026-10-02" }, NOW)).toMatchObject({
      since: new Date("2026-10-01T00:00:00Z"),
      until: new Date("2026-10-02T00:00:00Z"),
    });
  });

  it("parses minMag, bbox and limit", () => {
    expect(
      parseEventsQuery({ minMag: "4.5", bbox: "-136,27,-104,53", limit: "10" }, NOW),
    ).toMatchObject({
      minMag: 4.5,
      bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
      limit: 10,
    });
    expect(parseEventsQuery({ bbox: "170,-30,-170,-10" }, NOW).bbox).toEqual({
      minLon: 170,
      minLat: -30,
      maxLon: -170,
      maxLat: -10,
    });
  });

  it("rejects until before since, including before the default since", () => {
    expect(
      issuesOf(() => parseEventsQuery({ since: "2026-10-02", until: "2026-10-01" }, NOW)),
    ).toEqual([{ path: "until", message: "until must not precede since" }]);
    expect(issuesOf(() => parseEventsQuery({ until: "2026-01-01" }, NOW))[0]?.path).toBe("until");
  });

  it("rejects malformed values with the offending path", () => {
    const paths = (input: Record<string, unknown>) =>
      issuesOf(() => parseEventsQuery(input, NOW)).map((i) => i.path);
    expect(paths({ since: "yesterday" })).toEqual(["since"]);
    expect(paths({ since: ["2026-10-01", "2026-10-02"] })).toEqual(["since"]);
    expect(paths({ minMag: "big" })).toEqual(["minMag"]);
    expect(paths({ minMag: "11" })).toEqual(["minMag"]);
    expect(paths({ limit: "0" })).toEqual(["limit"]);
    expect(paths({ limit: "5001" })).toEqual(["limit"]);
    expect(paths({ limit: "2.5" })).toEqual(["limit"]);
    expect(paths({ bbox: "1,2,3" })).toEqual(["bbox"]);
    expect(paths({ bbox: "1,2,3,x" })).toEqual(["bbox.3"]);
    expect(paths({ bbox: "0,95,10,96" })).toEqual(["bbox.1", "bbox.3"]);
    expect(paths({ bbox: "0,10,10,5" })).toEqual(["bbox"]);
  });
});

describe("toListFilter", () => {
  it("drops null filters so optional properties stay absent", () => {
    expect(
      toListFilter({ since: WEEK_AGO, until: null, minMag: null, bbox: null, limit: 5 }),
    ).toEqual({ since: WEEK_AGO, limit: 5 });
    const bbox = { minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 };
    expect(toListFilter({ since: WEEK_AGO, until: NOW, minMag: 3, bbox, limit: 5 })).toEqual({
      since: WEEK_AGO,
      until: NOW,
      minMag: 3,
      bbox,
      limit: 5,
    });
  });
});

describe("aggregate queries", () => {
  it("parseEventsFilter shares the list defaults without a limit", () => {
    expect(parseEventsFilter({}, NOW)).toEqual({
      since: WEEK_AGO,
      until: null,
      minMag: null,
      bbox: null,
    });
    expect(issuesOf(() => parseEventsFilter({ limit: 5 }, NOW))).toEqual([
      { path: "", message: expect.stringContaining("Unrecognized") },
    ]);
  });

  it("parseSummaryQuery picks the bin size from the span unless given", () => {
    expect(parseSummaryQuery({}, NOW).by).toBe("day");
    expect(parseSummaryQuery({ since: "2026-06-01" }, NOW).by).toBe("month");
    expect(parseSummaryQuery({ since: "2000-01-01" }, NOW).by).toBe("year");
    expect(parseSummaryQuery({ since: "2000-01-01", until: "2000-02-01" }, NOW).by).toBe("day");
    expect(parseSummaryQuery({ since: "2000-01-01", by: "year" }, NOW).by).toBe("year");
    expect(issuesOf(() => parseSummaryQuery({ by: "week" }, NOW))[0]?.path).toBe("by");
  });

  it("parseGridQuery defaults to one-degree cells and allows only the fixed sizes", () => {
    expect(parseGridQuery({}, NOW).cell).toBe(1);
    expect(parseGridQuery({ cell: "0.25" }, NOW).cell).toBe(0.25);
    expect(issuesOf(() => parseGridQuery({ cell: "3" }, NOW))[0]?.path).toBe("cell");
  });
});

describe("runsQuerySchema and eventIdSchema", () => {
  it("defaults, filters and bounds", () => {
    expect(parseOrThrow(runsQuerySchema, {})).toEqual({ limit: 50 });
    expect(parseOrThrow(runsQuerySchema, { kind: "backfill", limit: "5" })).toEqual({
      kind: "backfill",
      limit: 5,
    });
    expect(issuesOf(() => parseOrThrow(runsQuerySchema, { kind: "nope" }))[0]?.path).toBe("kind");
    expect(issuesOf(() => parseOrThrow(runsQuerySchema, { limit: "501" }))[0]?.path).toBe("limit");
    expect(parseOrThrow(eventIdSchema, { id: "us6000u1pl" })).toEqual({ id: "us6000u1pl" });
    expect(issuesOf(() => parseOrThrow(eventIdSchema, { id: "x".repeat(65) }))[0]?.path).toBe("id");
  });

  it("parseOrThrow raises a 400 HttpError", () => {
    expect(() => parseOrThrow(runsQuerySchema, { limit: "no" })).toThrow(HttpError);
    try {
      parseOrThrow(runsQuerySchema, { limit: "no" });
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 400, message: "invalid request" });
    }
  });
});
