import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { capturePointer, mustRef } from "../../src/lib/dom.js";

describe("mustRef", () => {
  it("unwraps a mounted element ref and throws for a missing one", () => {
    const el = document.createElement("svg");
    expect(mustRef(ref(el), "svg")).toBe(el);
    expect(() => mustRef(ref(null), "svg")).toThrow("svg is not mounted");
  });

  it("captures the pointer on an element target and ignores any other", () => {
    const el = document.createElement("div");
    const captured: number[] = [];
    el.setPointerCapture = (id: number) => {
      captured.push(id);
    };
    const ev = new PointerEvent("pointerdown", { pointerId: 7 });
    Object.defineProperty(ev, "currentTarget", { value: el });
    capturePointer(ev);
    expect(captured).toEqual([7]);
    const none = new PointerEvent("pointerdown", { pointerId: 8 });
    Object.defineProperty(none, "currentTarget", { value: null });
    capturePointer(none);
    expect(captured).toEqual([7]);
  });
});
