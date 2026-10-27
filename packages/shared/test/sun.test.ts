import { describe, expect, it } from "vitest";
import {
  isSunKey,
  isSunSize,
  SUN_CREDIT,
  SUN_FRAMES,
  SUN_SIZES,
  sunFrame,
  type SunKey,
} from "../src/index.js";

describe("sun frames", () => {
  it("lists the seven frames in strip order with a title, a note and a source each", () => {
    expect(SUN_FRAMES.map((f) => f.key)).toEqual([
      "aia193",
      "aia304",
      "aia171",
      "hmii",
      "hmib",
      "c2",
      "c3",
    ]);
    expect(SUN_FRAMES.every((f) => f.title !== "" && f.note !== "")).toBe(true);
    expect(SUN_FRAMES.filter((f) => f.source === "soho").map((f) => f.key)).toEqual(["c2", "c3"]);
    expect(sunFrame("hmib").title).toBe("HMI magnetogram");
    expect(sunFrame("c2").note).toContain("CMEs");
    expect(() => sunFrame("nope" as SunKey)).toThrow(/unknown sun frame nope/);
  });

  it("recognises keys and sizes and carries the credit lines", () => {
    expect(isSunKey("c2")).toBe(true);
    expect(isSunKey("c4")).toBe(false);
    expect(SUN_SIZES).toEqual([512, 1024]);
    expect(isSunSize(1024)).toBe(true);
    expect(isSunSize(256)).toBe(false);
    expect(SUN_CREDIT.sdo).toContain("NASA/SDO");
    expect(SUN_CREDIT.soho).toBe("SOHO (ESA & NASA)");
  });
});
