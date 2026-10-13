import { afterEach, describe, expect, it, vi } from "vitest";
import { beachballUrl, clearBeachballCache } from "../../src/lib/beachball.js";
import { stubCanvas } from "../support/canvas.js";
import { mech } from "../support/events.js";

const colors = { fill: "#d2442a", tension: "#ffffff", ink: "#14202a" };
const centre = (16 + 16 * 16) * 4;

describe("beachballUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearBeachballCache();
  });
  it("rasterises compressional and dilatational pixels and caches by arguments", () => {
    const s = stubCanvas();
    const url = beachballUrl(mech(), 16, colors, false);
    expect(url).toBe("data:1");
    const px = s.data;
    expect(px[centre + 3]).toBe(255);
    expect([210, 255]).toContain(px[centre]);
    expect(px[3]).toBe(0);
    let fills = 0;
    let tensions = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      if (px[i] === 210) fills += 1;
      else tensions += 1;
    }
    expect(fills).toBeGreaterThan(100);
    expect(tensions).toBeGreaterThan(100);
    expect(beachballUrl(mech(), 16, colors, false)).toBe("data:1");
    expect(s.renders).toBe(1);
  });
  it("labels the T and P axes when asked, from stored axes or the tensor", () => {
    const s = stubCanvas();
    beachballUrl(mech(), 16, colors, true);
    expect(s.texts).toEqual(["T", "P"]);
    s.texts.length = 0;
    beachballUrl(mech({ tAzimuth: null }), 16, colors, true);
    expect(s.texts).toEqual(["T", "P"]);
  });
  it("returns an empty url without a tensor or a 2d context, and black for unparseable colours", () => {
    const bare = mech({
      strike1: null,
      dip1: null,
      rake1: null,
      strike2: null,
      dip2: null,
      rake2: null,
      tAzimuth: null,
    });
    expect(beachballUrl(bare, 16, colors, false)).toBe("");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(beachballUrl(mech(), 16, colors, false)).toBe("");
    vi.restoreAllMocks();
    const s = stubCanvas();
    beachballUrl(mech(), 16, { fill: "nope", tension: "nope", ink: "nope" }, false);
    expect([s.data[centre], s.data[centre + 1], s.data[centre + 2]]).toEqual([0, 0, 0]);
  });
});
