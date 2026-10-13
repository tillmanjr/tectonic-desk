import { describe, expect, it } from "vitest";
import { REGIONS } from "../src/regions.js";

describe("REGIONS", () => {
  it("defines the two prototype views", () => {
    expect(REGIONS.map((r) => r.id)).toEqual(["global", "wc"]);
    expect(REGIONS[0]).toMatchObject({ minMag: 4.5, days: 7, bbox: null });
    expect(REGIONS[1]).toMatchObject({
      minMag: 2.5,
      days: 30,
      bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
    });
  });
});
