import { afterEach, describe, expect, it, vi } from "vitest";
import { coarsePointer, touchCount, zoomAllowed } from "../../src/lib/touch.js";

const withTouches = (touches: unknown): Event =>
  Object.assign(new Event("touchstart"), { touches });

describe("zoomAllowed", () => {
  it("defers to the default filter while unlocked", () => {
    expect(zoomAllowed(false, new Event("wheel"), () => true)).toBe(true);
    expect(zoomAllowed(false, new Event("wheel"), () => false)).toBe(false);
  });
  it("lets only two-finger gestures through while locked", () => {
    const byDefault = () => true;
    expect(zoomAllowed(true, new Event("wheel"), byDefault)).toBe(false);
    expect(zoomAllowed(true, new Event("mousedown"), byDefault)).toBe(false);
    expect(zoomAllowed(true, withTouches({ length: 1 }), byDefault)).toBe(false);
    expect(zoomAllowed(true, withTouches({ length: 2 }), byDefault)).toBe(true);
    expect(zoomAllowed(true, withTouches({ length: 3 }), byDefault)).toBe(true);
    expect(zoomAllowed(true, withTouches(null), byDefault)).toBe(false);
    expect(zoomAllowed(true, withTouches({}), byDefault)).toBe(false);
    expect(zoomAllowed(true, withTouches({ length: "2" }), byDefault)).toBe(false);
  });
});

describe("touchCount", () => {
  it("counts touches and treats everything else as none", () => {
    expect(touchCount(withTouches({ length: 2 }))).toBe(2);
    expect(touchCount(new Event("mousedown"))).toBe(0);
  });
});

describe("coarsePointer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("reads the pointer media query", () => {
    expect(coarsePointer(() => ({ matches: true }))).toBe(true);
    expect(coarsePointer(() => ({ matches: false }))).toBe(false);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)" }));
    expect(coarsePointer()).toBe(true);
  });
});
