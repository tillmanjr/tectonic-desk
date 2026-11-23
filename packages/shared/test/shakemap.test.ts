import { describe, expect, it } from "vitest";
import { MMI_SCALE, mmiLevel } from "../src/index.js";

describe("MMI scale", () => {
  it("runs I to X+ with a colour each", () => {
    expect(MMI_SCALE.map((l) => l.mmi)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(MMI_SCALE.every((l) => /^#[0-9a-f]{6}$/.test(l.color))).toBe(true);
  });

  it("rounds an intensity to its level and caps at X+", () => {
    expect(mmiLevel(4.4)?.roman).toBe("IV");
    expect(mmiLevel(4.5)?.roman).toBe("V");
    expect(mmiLevel(11.2)?.roman).toBe("X+");
    expect(mmiLevel(0.3)).toBeNull();
  });
});
