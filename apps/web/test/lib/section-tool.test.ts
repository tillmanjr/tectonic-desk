import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { DEFAULT_HALF_KM, type Section } from "../../src/lib/section.js";
import { useSectionTool } from "../../src/lib/section-tool.js";

function make(initial: Section | null = null) {
  const section = ref<Section | null>(initial);
  const set = vi.fn((s: Section | null) => {
    section.value = s;
  });
  return { section, set, tool: useSectionTool(section, set) };
}

describe("section tool", () => {
  it("arms, places two points and commits with the default width", () => {
    const { tool, set } = make();
    tool.place([1, 1]);
    expect(set).not.toHaveBeenCalled();
    tool.toggle();
    expect(tool.armed.value).toBe(true);
    tool.hover([2, 2]);
    expect(tool.cursor.value).toBeNull();
    tool.place([0, 0]);
    expect(tool.pending.value).toEqual([0, 0]);
    tool.hover([3, 0]);
    expect(tool.cursor.value).toEqual([3, 0]);
    tool.place([0, 0]);
    expect(set).not.toHaveBeenCalled();
    tool.place([10, 0]);
    expect(set).toHaveBeenCalledWith({ a: [0, 0], b: [10, 0], halfKm: DEFAULT_HALF_KM });
    expect(tool.armed.value).toBe(false);
    expect(tool.pending.value).toBeNull();
    expect(tool.cursor.value).toBeNull();
    expect(tool.shown.value).toEqual({ a: [0, 0], b: [10, 0], halfKm: DEFAULT_HALF_KM });
  });

  it("drops a pending point on toggle or cancel", () => {
    const { tool, set } = make();
    tool.toggle();
    tool.place([0, 0]);
    tool.toggle();
    expect(tool.armed.value).toBe(false);
    expect(tool.pending.value).toBeNull();
    tool.toggle();
    tool.place([0, 0]);
    tool.hover([1, 1]);
    tool.cancel();
    expect(tool.pending.value).toBeNull();
    expect(tool.cursor.value).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  it("drags a handle through a draft and commits once on end", () => {
    const { tool, set } = make({ a: [0, 0], b: [10, 0], halfKm: 50 });
    tool.dragMove([5, 5]);
    tool.dragEnd();
    expect(set).not.toHaveBeenCalled();
    tool.dragStart("b");
    tool.dragMove([12, 1]);
    expect(tool.shown.value).toEqual({ a: [0, 0], b: [12, 1], halfKm: 50 });
    expect(set).not.toHaveBeenCalled();
    tool.dragEnd();
    expect(set).toHaveBeenCalledWith({ a: [0, 0], b: [12, 1], halfKm: 50 });
    tool.dragEnd();
    expect(set).toHaveBeenCalledTimes(1);
    tool.dragStart("a");
    tool.dragMove([12, 1]);
    tool.dragEnd();
    expect(set).toHaveBeenCalledTimes(1);
    expect(tool.shown.value).toEqual({ a: [0, 0], b: [12, 1], halfKm: 50 });
  });

  it("ignores a drag without a section, clears, and clamps the half-width", () => {
    const empty = make();
    empty.tool.dragStart("a");
    empty.tool.dragMove([1, 1]);
    empty.tool.dragEnd();
    empty.tool.setHalfKm(80);
    expect(empty.set).not.toHaveBeenCalled();
    const { tool, set } = make({ a: [0, 0], b: [10, 0], halfKm: 50 });
    tool.setHalfKm(1);
    expect(set).toHaveBeenLastCalledWith({ a: [0, 0], b: [10, 0], halfKm: 5 });
    tool.setHalfKm(1000);
    expect(set).toHaveBeenLastCalledWith({ a: [0, 0], b: [10, 0], halfKm: 500 });
    tool.setHalfKm(80);
    expect(set).toHaveBeenLastCalledWith({ a: [0, 0], b: [10, 0], halfKm: 80 });
    tool.toggle();
    tool.clear();
    expect(set).toHaveBeenLastCalledWith(null);
    expect(tool.armed.value).toBe(false);
  });
});
