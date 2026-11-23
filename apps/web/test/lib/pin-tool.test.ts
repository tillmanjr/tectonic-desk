import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { PIN_HOLD_MS, PIN_SLOP_PX, usePinTool } from "../../src/lib/pin-tool.js";
import { createPins, type PinView } from "../../src/lib/pins.js";

function setup(view: PinView = "global") {
  const pins = createPins(null, () => new Date("2026-11-22T12:00:00Z"));
  const v = ref<PinView>(view);
  const tool = usePinTool(pins, () => v.value);
  return { pins, v, tool };
}

describe("usePinTool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens armed without a pin, places on a click and closes cleanly", () => {
    const { pins, tool } = setup();
    tool.place([1, 1]);
    expect(pins.doc.value.current.global).toBeNull();
    tool.hover([1, 1]);
    expect(tool.cursor.value).toBeNull();
    tool.toggle();
    expect(tool.open.value).toBe(true);
    expect(tool.armed.value).toBe(true);
    tool.hover([3, 4]);
    expect(tool.cursor.value).toEqual([3, 4]);
    tool.place([3, 4]);
    expect(tool.armed.value).toBe(false);
    expect(tool.cursor.value).toBeNull();
    expect(tool.pin.value).toMatchObject({ lon: 3, lat: 4 });
    expect(tool.shown.value).toEqual([3, 4]);
    tool.toggle();
    expect(tool.open.value).toBe(false);
    tool.toggle();
    expect(tool.armed.value).toBe(false);
  });

  it("re-arms from the bar and follows the view", () => {
    const { tool, v } = setup();
    tool.arm();
    tool.place([3, 4]);
    v.value = "wc";
    expect(tool.pin.value).toBeNull();
    expect(tool.shown.value).toBeNull();
    tool.arm();
    expect(tool.open.value).toBe(true);
    expect(tool.armed.value).toBe(true);
    tool.place([-120, 40]);
    expect(tool.pin.value?.view).toBe("wc");
  });

  it("opens the bar on a quick press and ignores presses without a pin or while armed", () => {
    const { tool } = setup();
    tool.press([0, 0]);
    expect(tool.holding.value).toBe(false);
    tool.arm();
    tool.place([3, 4]);
    tool.open.value = false;
    tool.press([10, 10]);
    expect(tool.holding.value).toBe(true);
    tool.pressMove([11, 10], [3.1, 4]);
    tool.release();
    expect(tool.open.value).toBe(true);
    expect(tool.holding.value).toBe(false);
    tool.arm();
    tool.press([10, 10]);
    expect(tool.holding.value).toBe(false);
  });

  it("gives up the hold when the press wanders, so a drag never moves the pin", () => {
    const { tool } = setup();
    tool.arm();
    tool.place([3, 4]);
    tool.open.value = false;
    tool.press([10, 10]);
    tool.pressMove([10 + PIN_SLOP_PX + 1, 10], [9, 9]);
    expect(tool.holding.value).toBe(false);
    vi.advanceTimersByTime(PIN_HOLD_MS);
    expect(tool.lifted.value).toBe(false);
    tool.pressMove([40, 40], [9, 9]);
    tool.release();
    expect(tool.pin.value).toMatchObject({ lon: 3, lat: 4 });
    expect(tool.open.value).toBe(false);
  });

  it("lifts after a held press, follows the pointer and sets down on release", () => {
    const { tool } = setup();
    tool.arm();
    tool.place([3, 4]);
    tool.press([10, 10]);
    tool.press([10, 10]);
    vi.advanceTimersByTime(PIN_HOLD_MS);
    expect(tool.lifted.value).toBe(true);
    expect(tool.shown.value).toEqual([3, 4]);
    tool.pressMove([50, 50], [5, 6]);
    tool.pressMove([900, 900], null);
    expect(tool.shown.value).toEqual([5, 6]);
    tool.release();
    expect(tool.lifted.value).toBe(false);
    expect(tool.pin.value).toMatchObject({ lon: 5, lat: 6 });
  });

  it("drops a lifted pin back on cancel, renames and removes", () => {
    const { tool, pins } = setup();
    tool.arm();
    tool.place([3, 4]);
    tool.press([10, 10]);
    vi.advanceTimersByTime(PIN_HOLD_MS);
    tool.pressMove([50, 50], [5, 6]);
    tool.cancel();
    tool.release();
    expect(tool.pin.value).toMatchObject({ lon: 3, lat: 4 });
    tool.press([10, 10]);
    vi.advanceTimersByTime(PIN_HOLD_MS);
    tool.release();
    expect(tool.pin.value).toMatchObject({ lon: 3, lat: 4 });
    tool.rename(" Site ");
    expect(tool.pin.value?.name).toBe("Site");
    tool.remove();
    expect(tool.pin.value).toBeNull();
    expect(pins.doc.value.history).toHaveLength(1);
  });
});
