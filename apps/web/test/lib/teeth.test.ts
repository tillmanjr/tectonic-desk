import { describe, expect, it } from "vitest";
import { polarity, teethPath } from "../../src/lib/teeth.js";

const count = (d: string): number => d.split("M").length - 1;

describe("polarity", () => {
  it("reads Bird's slash convention", () => {
    expect(polarity("KE/PA")).toBe("left");
    expect(polarity("NZ\\SA")).toBe("right");
    expect(polarity("AF-AN")).toBeNull();
    expect(polarity("")).toBeNull();
  });
});

describe("teethPath", () => {
  const line: [number, number][] = [
    [0, 0],
    [100, 0],
  ];
  it("places a tooth every 14 units from 7 in, apex on the geographic left or right", () => {
    const left = teethPath(line, 1, "left");
    expect(count(left)).toBe(7);
    expect(left.startsWith("M4.30,0.00L7.00,-6.00L9.70,0.00Z")).toBe(true);
    const right = teethPath(line, 1, "right");
    expect(right.startsWith("M4.30,0.00L7.00,6.00L9.70,0.00Z")).toBe(true);
  });
  it("keeps a constant screen size as the zoom grows", () => {
    const zoomed = teethPath(line, 16, "left");
    expect(count(zoomed)).toBe(57);
    expect(zoomed).toContain("L0.88,-0.75L");
  });
  it("skips over-long steps, breaks on null, and survives zero-length steps", () => {
    expect(
      teethPath(
        [
          [0, 0],
          [500, 0],
        ],
        1,
        "left",
      ),
    ).toBe("");
    const broken = teethPath([[0, 0], [50, 0], null, [0, 20], [50, 20]], 1, "left", {
      spacing: 20,
      size: 4,
    });
    expect(count(broken)).toBe(6);
    expect(broken).toContain("L10.00,-4.00L");
    expect(broken).toContain("L10.00,16.00L");
    const zero = teethPath(
      [
        [0, 0],
        [0, 0],
        [50, 0],
      ],
      1,
      "left",
      { spacing: 20 },
    );
    expect(count(zero)).toBe(3);
    expect(teethPath([], 1, "left")).toBe("");
    expect(teethPath([[1, 1]], 1, "left")).toBe("");
  });
  it("carries the remainder across vertices", () => {
    const d = teethPath(
      [
        [0, 0],
        [10, 0],
        [30, 0],
      ],
      1,
      "left",
      { spacing: 14 },
    );
    expect(count(d)).toBe(2);
    expect(d).toContain("L21.00,-6.00L");
  });
});
