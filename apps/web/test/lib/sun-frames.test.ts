import type { SunKey } from "@tectonic/shared";
import { describe, expect, it } from "vitest";
import { stepKey } from "../../src/lib/sun-frames.js";

describe("stepKey", () => {
  it("steps along the strip and wraps at both ends", () => {
    expect(stepKey("aia193", 1)).toBe("aia304");
    expect(stepKey("c3", 1)).toBe("aia193");
    expect(stepKey("aia193", -1)).toBe("c3");
    expect(stepKey("hmib", -2)).toBe("aia171");
    expect(stepKey("nope" as SunKey, 1)).toBe("nope");
  });
});
