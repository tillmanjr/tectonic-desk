import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  jp2Codestream,
  loadRelief,
  placeTile,
  RELIEF,
  RELIEF_TILES,
  reliefAlong,
  sampleRelief,
  type ReliefLayout,
} from "../../src/geo/relief.js";

/** A 4×2 world: 90° cells, one-cell tiles. */
const tiny: ReliefLayout = { width: 4, height: 2, cellDeg: 90, scale: 0.5, tileSize: 1 };

function box(type: string, body: number[], longForm = false): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < type.length; i++) bytes.push(type.charCodeAt(i));
  if (longForm) {
    const len = 16 + body.length;
    return [0, 0, 0, 1, ...bytes, 0, 0, 0, 0, 0, 0, 0, len, ...body];
  }
  const len = 8 + body.length;
  return [0, 0, 0, len, ...bytes, ...body];
}

describe("jp2Codestream", () => {
  it("finds the codestream box through short, long and to-the-end boxes", () => {
    const file = new Uint8Array([
      ...box("jP  ", [13, 10, 135, 10]),
      ...box("ftyp", [1, 2, 3, 4], true),
      ...box("jp2c", [0xff, 0x4f, 7, 8]),
    ]);
    expect(Array.from(jp2Codestream(file))).toEqual([0xff, 0x4f, 7, 8]);
    const open = new Uint8Array([...box("ftyp", [1]), 0, 0, 0, 0, 106, 112, 50, 99, 9, 9]);
    expect(Array.from(jp2Codestream(open))).toEqual([9, 9]);
    const raw = new Uint8Array([0xff, 0x4f, 1, 2]);
    expect(jp2Codestream(raw)).toBe(raw);
    expect(() => jp2Codestream(new Uint8Array([...box("ftyp", [1])]))).toThrow("no codestream");
  });
});

describe("grid", () => {
  it("places scaled tiles at their corners and lists eight 90° tiles", () => {
    const grid = new Int16Array(8);
    placeTile(grid, new Int16Array([20]), -180, 90, tiny);
    placeTile(grid, new Int16Array([-40]), 90, 90, tiny);
    placeTile(grid, new Int16Array([7]), -90, 0, tiny);
    expect(Array.from(grid)).toEqual([10, 0, 0, -20, 0, 4, 0, 0]);
    expect(RELIEF_TILES).toHaveLength(8);
    expect(RELIEF.width * RELIEF.height).toBe(7200 * 3600);
    expect(RELIEF_TILES.map((t) => t.name).sort()).toEqual([
      "N00E000",
      "N00E090",
      "N00W090",
      "N00W180",
      "S90E000",
      "S90E090",
      "S90W090",
      "S90W180",
    ]);
  });

  it("samples bilinearly with longitude wrap and latitude clamp", () => {
    // Row 0 (north): 0 10 20 30; row 1 (south): 40 50 60 70.
    const grid = new Int16Array([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(sampleRelief(grid, -135, 45, tiny)).toBe(0);
    expect(sampleRelief(grid, -45, 45, tiny)).toBe(10);
    expect(sampleRelief(grid, -90, 45, tiny)).toBe(5);
    expect(sampleRelief(grid, -135, 0, tiny)).toBe(20);
    expect(sampleRelief(grid, 180, 45, tiny)).toBe(15);
    expect(sampleRelief(grid, -135, 89, tiny)).toBe(0);
    expect(sampleRelief(grid, -135, -89, tiny)).toBe(40);
  });

  it("samples n points along the line with their spacing", () => {
    const grid = new Int16Array([0, 10, 20, 30, 40, 50, 60, 70]);
    const r = reliefAlong(grid, [-135, 45], [-45, 45], 3, tiny);
    expect(r.metres).toEqual([0, 5, 10]);
    // 90° of longitude at 45°N is a 60° arc, 6672 km, in two steps.
    expect(r.stepKm).toBeCloseTo(3335.85, 0);
  });
});

describe("loadRelief", () => {
  const dir = mkdtempSync(join(tmpdir(), "relief-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a raw int16 file and answers null for a missing one", () => {
    const path = join(dir, "grid.i16");
    writeFileSync(path, Buffer.from(new Int16Array([1, -2, 300]).buffer));
    expect(Array.from(loadRelief(path) ?? [])).toEqual([1, -2, 300]);
    expect(loadRelief(join(dir, "nope.i16"))).toBeNull();
  });
});
