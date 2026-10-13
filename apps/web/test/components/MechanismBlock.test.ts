import { afterEach, describe, expect, it, vi } from "vitest";
import MechanismBlock from "../../src/components/MechanismBlock.vue";
import { stubCanvas } from "../support/canvas.js";
import { mech } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

/** Visible text with a space at every element boundary. */
const text = (w: { html: () => string }) =>
  w
    .html()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("MechanismBlock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("renders a moment tensor in full", async () => {
    stubCanvas();
    const w = mountWith(MechanismBlock, await makeContext(), { mechanism: mech(), depthKm: 190 });
    const t = text(w);
    expect(w.find("h3").text()).toBe("Moment tensor");
    expect(w.find("img").attributes("width")).toBe("150");
    expect(t).toContain("Oblique Normal");
    expect(t).toContain("013° / 69° / -126°");
    expect(t).toContain("256° / 41° / -34°");
    expect(t).toContain("T axis az 128° · plunge 16°");
    expect(t).toContain("1.90 × 10 17 N·m");
    expect(t).toContain("Mw 5.5");
    expect(t).toContain("190.5 km");
    expect(t).toContain("89%");
    expect(t).toContain("us network · us_1");
    expect(t).not.toContain("reconstructed");
  });
  it("renders a first-motion solution with strike-slip sense and the reconstructed flag", async () => {
    stubCanvas();
    const ss = mech({
      kind: "fm",
      strike1: 270,
      dip1: 89,
      rake1: -2,
      strike2: 0,
      dip2: 88,
      rake2: -179,
      tAzimuth: null,
      tPlunge: null,
      pAzimuth: null,
      pPlunge: null,
      planesReconstructed: true,
    });
    const w = mountWith(MechanismBlock, await makeContext(), { mechanism: ss, depthKm: 5 });
    const t = text(w);
    expect(w.find("h3").text()).toBe("Focal mechanism (first motion)");
    expect(t).toContain("Strike-slip");
    expect(t).toContain("left-lateral on plane 1 (270°) or right-lateral on plane 2 (0°)");
    expect(t).toContain("reconstructed from P/T axes");
    expect(t).toContain("T axis az");
    expect(t).not.toContain("Scalar moment");
  });
  it("shows dashes for missing tensor fields and the low-DC note", async () => {
    stubCanvas();
    const lowDc = mountWith(MechanismBlock, await makeContext(), {
      mechanism: mech({ percentDc: 0.1, scalarMoment: null, mw: null, depthKm: null }),
      depthKm: 5,
    });
    const t = text(lowDc);
    expect(t).toContain("10% · large non-DC component; planes less diagnostic");
    expect(t).toContain("Scalar moment —");
    expect(t).toContain("Moment magnitude —");
    expect(t).toContain("Centroid depth —");
    const noDc = mountWith(MechanismBlock, await makeContext(), {
      mechanism: mech({ percentDc: null }),
      depthKm: 5,
    });
    expect(text(noDc)).toContain("Double couple —");
  });
  it("flags planes reconstructed on the client", async () => {
    stubCanvas();
    const axesOnly = mech({
      strike1: null,
      dip1: null,
      rake1: null,
      strike2: null,
      dip2: null,
      rake2: null,
    });
    const w = mountWith(MechanismBlock, await makeContext(), {
      mechanism: axesOnly,
      depthKm: 5,
    });
    expect(w.text()).toContain("reconstructed from P/T axes");
  });
  it("explains when nothing can be drawn", async () => {
    const bare = mech({
      strike1: null,
      dip1: null,
      rake1: null,
      strike2: null,
      dip2: null,
      rake2: null,
      tAzimuth: null,
    });
    const w = mountWith(MechanismBlock, await makeContext(), { mechanism: bare, depthKm: 5 });
    expect(w.text()).toContain("no nodal planes or axes to draw");
  });
});
