import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { mustRef } from "../../src/lib/dom.js";

describe("mustRef", () => {
  it("unwraps a mounted element ref and throws for a missing one", () => {
    const el = document.createElement("svg");
    expect(mustRef(ref(el), "svg")).toBe(el);
    expect(() => mustRef(ref(null), "svg")).toThrow("svg is not mounted");
  });
});
