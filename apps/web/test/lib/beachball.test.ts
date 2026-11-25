import { afterEach, describe, expect, it, vi } from "vitest";
import { beachballUrl, bowlScene, clearBeachballCache, drawBowl } from "../../src/lib/beachball.js";
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

describe("bowl beachball", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const bowlColors = { ...colors, under: "#b9c2c9" };
  const context = (): CanvasRenderingContext2D | null =>
    document.createElement("canvas").getContext("2d");
  it("builds a scene at twice the css size, or none without a tensor", () => {
    const scene = bowlScene(mech(), 20, bowlColors);
    expect(scene?.n).toBe(40);
    expect(scene?.r0).toBe(17);
    expect(scene?.texture.length).toBeGreaterThan(1000);
    expect(
      bowlScene(mech({ strike1: null, dip1: null, rake1: null, tAzimuth: null }), 20, bowlColors),
    ).toBeNull();
    expect(bowlScene(mech({ tAzimuth: null }), 20, bowlColors)?.axes.t.plunge).toBeCloseTo(16, -1);
  });
  it("letters the marks in a colour that reads on the ink in either theme", () => {
    expect(bowlScene(mech(), 20, bowlColors)?.paper).toBe("#ffffff");
    const dark = { ...bowlColors, tension: "#e9eef1", ink: "#e3e9ed" };
    expect(bowlScene(mech(), 20, dark)?.paper).toBe("#0c1216");
  });
  it("draws the plan view near 0° and the tilted bowl otherwise, with both axes", () => {
    const s = stubCanvas();
    const g = context();
    const scene = bowlScene(mech(), 20, bowlColors);
    if (g === null || scene === null) throw new Error("no scene");
    drawBowl(g, scene, 0.01);
    expect(s.texts).toEqual(["T", "P"]);
    expect(s.arcs).toBe(3);
    const centre = (20 + 20 * 40) * 4;
    expect(s.data[centre + 3]).toBe(255);
    s.texts.length = 0;
    drawBowl(g, scene, -35);
    expect(s.texts).toEqual(["T", "P"]);
    // the tilted rim is a path, not an arc: only the two marks are arcs
    expect(s.arcs).toBe(5);
  });
  it("rings an axis the near rim hides", () => {
    const s = stubCanvas();
    const g = context();
    const hidden = mech({ tAzimuth: 180, tPlunge: 2, pAzimuth: 0, pPlunge: 40 });
    const scene = bowlScene(hidden, 20, bowlColors);
    if (g === null || scene === null) throw new Error("no scene");
    const dash = vi.spyOn(g, "setLineDash");
    drawBowl(g, scene, 60);
    expect(dash).toHaveBeenCalledTimes(2);
    expect(s.texts).toEqual(["T", "P"]);
  });
});
