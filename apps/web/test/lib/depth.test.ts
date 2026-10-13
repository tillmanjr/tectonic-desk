import { describe, expect, it } from "vitest";
import { DEPTH_LABEL, depthClass, depthColor, depthVar } from "../../src/lib/depth.js";

describe("depth classes", () => {
  it("classifies by the 70 and 300 km boundaries", () => {
    expect(depthClass(10)).toBe("shallow");
    expect(depthClass(70)).toBe("intermediate");
    expect(depthClass(300)).toBe("deep");
    expect(depthClass(null)).toBe("unknown");
  });
  it("maps to labels, variables and colours", () => {
    expect(DEPTH_LABEL.deep).toBe("deep (≥300 km)");
    expect(depthVar(null)).toBe("--muted");
    expect(depthColor(5)).toBe("var(--shallow)");
  });
});
