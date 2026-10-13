import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapTeeth from "../../src/components/MapTeeth.vue";
import { frameFor, type PlateSegment } from "../../src/lib/geo.js";
import { GLOBAL } from "../support/events.js";

const segments: PlateSegment[] = [
  {
    b: "KE/PA",
    c: "sub",
    v: 60,
    p: [
      [-178, -30],
      [-177, -25],
      [-176, -20],
    ],
  },
  {
    b: "PA-NA",
    c: "sub",
    v: 50,
    p: [
      [-125, 48],
      [-126, 49],
    ],
  },
  {
    b: "NZ\\SA",
    c: "trans",
    v: 10,
    p: [
      [-72, -20],
      [-72, -25],
    ],
  },
];

describe("MapTeeth", () => {
  it("draws one path per subduction segment with a polarity and re-lays on zoom", async () => {
    const w = mount(MapTeeth, { props: { frame: frameFor(GLOBAL), segments, k: 1 } });
    const paths = w.findAll("path");
    expect(paths).toHaveLength(1);
    const d1 = paths[0]?.attributes("d") ?? "";
    expect(d1.startsWith("M")).toBe(true);
    await w.setProps({ k: 8 });
    const d2 = w.find("path").attributes("d") ?? "";
    expect(d2).not.toBe(d1);
    expect(d2.split("M").length).toBeGreaterThan(d1.split("M").length);
  });
});
