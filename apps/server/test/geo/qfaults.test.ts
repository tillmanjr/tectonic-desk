import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  faultTopology,
  mergeTraces,
  parseSymbology,
  stitchLines,
  type QfaultPiece,
} from "../../src/geo/qfaults.js";

const page = JSON.parse(
  readFileSync(new URL("../fixtures/usgs/qfaults-page.json", import.meta.url), "utf8"),
) as { features: QfaultPiece[] };

function piece(
  properties: Record<string, unknown>,
  coordinates: number[][] | number[][][] = [
    [0, 0],
    [1, 1],
  ],
): QfaultPiece {
  const multi = Array.isArray(coordinates[0]?.[0]);
  return {
    type: "Feature",
    geometry: multi
      ? { type: "MultiLineString", coordinates: coordinates as number[][][] }
      : { type: "LineString", coordinates: coordinates as number[][] },
    properties,
  };
}

describe("parseSymbology", () => {
  it("maps the USGS symbology text to an age code and certainty", () => {
    expect(parseSymbology("historic Well Constrained")).toEqual({ age: "historic", cert: "well" });
    expect(parseSymbology("latest Quaternary Moderately Constrained")).toEqual({
      age: "latest",
      cert: "mod",
    });
    expect(parseSymbology("late Quaternary Inferred")).toEqual({ age: "late", cert: "inf" });
    expect(parseSymbology("middle and late Quaternary Well Constrained").age).toBe("mid");
    expect(parseSymbology("undifferentiated Quaternary Inferred").age).toBe("undiff");
    expect(parseSymbology("unspecified Well Constrained").age).toBe("other");
    expect(parseSymbology("class B Moderately Constrained")).toEqual({
      age: "other",
      cert: "mod",
    });
    expect(parseSymbology(null)).toEqual({ age: "other", cert: "well" });
  });
});

describe("stitchLines", () => {
  it("chains lines whose ends meet or nearly meet, reversing as needed, and leaves loners alone", () => {
    expect(
      stitchLines([
        [
          [1, 1],
          [2, 2],
        ],
        [
          [5, 5],
          [6, 6],
        ],
        [
          [3, 3],
          [2, 2],
        ],
        [
          [0, 0],
          [1, 1],
        ],
        [
          [4, 4],
          [3, 3],
        ],
      ]),
    ).toEqual([
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]);
    expect(
      stitchLines([
        [
          [1, 1],
          [2, 2],
        ],
        [
          [1, 1],
          [0, 0],
        ],
      ]),
    ).toEqual([
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    ]);
    expect(stitchLines([])).toEqual([]);
    expect(() => stitchLines([[]])).toThrow("empty line");
    const near = stitchLines([
      [
        [0, 0],
        [1, 1],
      ],
      [
        [1.0004, 1.0004],
        [9, 9],
      ],
      [
        [1.0001, 1.0001],
        [2, 2],
      ],
      [
        [2.002, 2],
        [3, 3],
      ],
    ]);
    expect(near.map((l) => l.length)).toEqual([3, 2, 2]);
    expect(near[0]?.[1]).toEqual([1, 1]);
    expect(near[0]?.[2]).toEqual([2, 2]);
  });
});

describe("mergeTraces", () => {
  it("folds the pieces of a fault section and style into one feature, rounding coordinates", () => {
    const merged = mergeTraces(page.features);
    expect(page.features).toHaveLength(6);
    expect(
      merged.map((f) => `${f.properties.id} ${f.properties.age} ${f.properties.cert}`),
    ).toEqual([
      "238 latest inf",
      "238 latest mod",
      "353 undiff inf",
      "380 undiff well",
      "400 undiff well",
    ]);
    const pleasanton = merged[1];
    expect(pleasanton?.geometry.coordinates.length).toBeGreaterThan(0);
    expect(pleasanton?.properties).toEqual({
      id: "238",
      name: "Pleasanton fault",
      section: null,
      age: "latest",
      cert: "mod",
      rate: null,
      sense: null,
      dip: null,
    });
    expect(merged[2]?.properties).toMatchObject({
      name: "Mount Diablo thrust fault",
      sense: "Thrust",
      dip: "NE",
      rate: null,
    });
    for (const f of merged) {
      for (const line of f.geometry.coordinates) {
        for (const v of line.flat()) expect(v).toBe(Math.round(v * 1e5) / 1e5);
      }
    }
  });
  it("keeps every line of a multi-line piece, names sections, and falls back for blanks", () => {
    const merged = mergeTraces([
      piece(
        {
          fault_id: "55",
          section_id: "c",
          fault_name: "Hayward fault zone",
          section_name: "Southern Hayward section",
          symbology: "historic Well Constrained",
          slip_rate: "Between 1.0 and 5.0 mm/yr",
          slip_sense: "Right lateral",
          dip_direction: "Vertical",
        },
        [
          [
            [-122.1, 37.6],
            [-122.0, 37.5],
          ],
          [
            [-121.9, 37.4],
            [-121.8, 37.3],
          ],
        ],
      ),
      piece({}, [[[4, 4]], []]),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.geometry.coordinates).toEqual([[[4, 4]]]);
    expect(() => mergeTraces([piece({}, [[5]])])).toThrow("bad coordinate [5]");
    expect(() => mergeTraces([piece({}, [[]])])).toThrow("bad coordinate []");
    expect(merged[0]?.geometry.coordinates).toHaveLength(2);
    expect(merged[0]?.properties).toEqual({
      id: "55-c",
      name: "Hayward fault zone",
      section: "Southern Hayward section",
      age: "historic",
      cert: "well",
      rate: "Between 1.0 and 5.0 mm/yr",
      sense: "Right lateral",
      dip: "Vertical",
    });
    expect(merged[1]?.properties).toEqual({
      id: "?",
      name: "Unnamed fault",
      section: null,
      age: "other",
      cert: "well",
      rate: null,
      sense: null,
      dip: null,
    });
  });
});

describe("faultTopology", () => {
  it("builds one quantised object, dropping vertices below the weight and keeping bends", () => {
    const merged = mergeTraces([
      piece({ fault_id: "1", symbology: "historic Well Constrained" }, [
        [0, 0],
        [0.5, 0],
        [1, 0],
      ]),
      piece({ fault_id: "2", symbology: "historic Well Constrained" }, [
        [0, 1],
        [0.5, 1.01],
        [1, 1],
      ]),
    ]);
    const topo = faultTopology(merged, { quantization: 1e4 });
    expect(Object.keys(topo.objects)).toEqual(["faults"]);
    expect(topo.transform?.scale.every((s) => s > 0)).toBe(true);
    expect(topo.arcs).toHaveLength(2);
    expect(topo.arcs[0]).toHaveLength(2);
    expect(topo.arcs[1]).toHaveLength(3);
    expect(topo.objects.faults?.type).toBe("GeometryCollection");
    const defaults = faultTopology(merged);
    expect(defaults.transform?.scale[0]).toBeLessThan(topo.transform?.scale[0] ?? 0);
  });
});
