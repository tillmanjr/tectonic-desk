import { describe, expect, it } from "vitest";
import { parseGxf } from "../../src/lib/gxf.js";

const TEXT = `#TITLE
A tiny grid
#POINTS
3
#ROWS
2
#SENSE
1
#XORIGIN
-100
#YORIGIN
200
#ROTATION
0
#PTSEPARATION
10
#RWSEPARATION
10
#DUMMY
-1e32
#MAP_PROJECTION
"NAD27 / something"

#GRID
1 2
3
4 -1e32 6
`;

describe("parseGxf", () => {
  it("reads the header and the wrapped numbers, with dummies as NaN", () => {
    const g = parseGxf(TEXT);
    expect(g.points).toBe(3);
    expect(g.rows).toBe(2);
    expect(g.xOrigin).toBe(-100);
    expect(g.yOrigin).toBe(200);
    expect(g.ptSeparation).toBe(10);
    expect(g.rwSeparation).toBe(10);
    expect(g.dummy).toBe(-1e32);
    expect(Array.from(g.values)).toEqual([1, 2, 3, 4, NaN, 6]);
  });

  it("keeps the first value line of a repeated key and ignores extra numbers", () => {
    const g = parseGxf(TEXT.replace("#POINTS\n3", "#POINTS\n3\n99") + "7 8 9\n");
    expect(g.points).toBe(3);
    expect(g.values).toHaveLength(6);
  });

  it("rejects text without a grid, a missing header or a short grid", () => {
    expect(() => parseGxf("#POINTS\n3\n")).toThrow("no #GRID");
    expect(() => parseGxf(TEXT.replace("#ROWS\n2\n", ""))).toThrow("missing #ROWS");
    expect(() => parseGxf(TEXT.replace("4 -1e32 6", "4"))).toThrow("4 of 6 values");
  });
});
