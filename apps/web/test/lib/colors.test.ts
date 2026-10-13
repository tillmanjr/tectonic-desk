import { describe, expect, it } from "vitest";
import { cssVar } from "../../src/lib/colors.js";

describe("cssVar", () => {
  it("reads a custom property from the given element", () => {
    const root = document.createElement("div");
    root.style.setProperty("--accent", " #0a6a85 ");
    document.body.append(root);
    expect(cssVar("--accent", root)).toBe("#0a6a85");
    expect(cssVar("--missing", root)).toBe("");
  });
  it("defaults to the document element", () => {
    document.documentElement.style.setProperty("--x", "red");
    expect(cssVar("--x")).toBe("red");
  });
});
