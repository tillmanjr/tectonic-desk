import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import BowlBeachball from "../../src/components/BowlBeachball.vue";
import { BOWL_HOLD_MS, BOWL_SETTLE_MS } from "../../src/lib/bowl.js";
import { stubCanvas } from "../support/canvas.js";
import { mech } from "../support/events.js";
import { makeContext, mountWith } from "../support/mount.js";

const SETTLED = BOWL_HOLD_MS + BOWL_SETTLE_MS + 100;

const reduceMotion = (on: boolean): void => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: on } as unknown as MediaQueryList);
};

describe("BowlBeachball", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const mount = async (over: Partial<Parameters<typeof mech>[0]> = {}) => {
    const ctx = await makeContext();
    const w = mountWith(BowlBeachball, ctx, {
      mechanism: mech(over),
      px: 20,
      depthKm: 10,
      alt: "Beachball",
    });
    return { ctx, w };
  };
  const tilt = (w: { find: (s: string) => { text: () => string } }): string =>
    w.find("output").text();

  it("opens tilted, holds, settles to the plan view, and tilts again with the slider", async () => {
    stubCanvas();
    reduceMotion(false);
    const { w } = await mount();
    expect(w.find("canvas").attributes()).toMatchObject({
      width: "40",
      height: "40",
      "aria-label": "Beachball",
    });
    expect(w.find(".bowlball").attributes("data-tour")).toBe("mech.ball");
    expect(tilt(w)).toBe("30°");
    vi.advanceTimersByTime(BOWL_HOLD_MS / 2);
    await nextTick();
    expect(tilt(w)).toBe("30°");
    vi.advanceTimersByTime(SETTLED);
    await nextTick();
    expect(tilt(w)).toBe("0°");
    await w.find("input").setValue("-20");
    expect(tilt(w)).toBe("−20°");
    vi.advanceTimersByTime(SETTLED);
    await nextTick();
    expect(tilt(w)).toBe("−20°");
    await w.find("button").trigger("click");
    expect(tilt(w)).toBe("30°");
    vi.advanceTimersByTime(BOWL_HOLD_MS + BOWL_SETTLE_MS / 2);
    await nextTick();
    // moving the slider mid-settle stops it where the reader puts it
    await w.find("input").setValue("12");
    vi.advanceTimersByTime(SETTLED);
    await nextTick();
    expect(tilt(w)).toBe("12°");
    w.unmount();
  });

  it("settles afresh for a different solution, not for a refreshed copy of the same one", async () => {
    stubCanvas();
    reduceMotion(false);
    const { w } = await mount();
    vi.advanceTimersByTime(SETTLED);
    await nextTick();
    await w.setProps({ mechanism: mech() });
    expect(tilt(w)).toBe("0°");
    await w.setProps({ mechanism: mech({ strike1: 100 }) });
    expect(tilt(w)).toBe("30°");
    // unmounted mid-settle, the frame is cancelled
    w.unmount();
    vi.advanceTimersByTime(SETTLED);
  });

  it("opens at 0° with reduced motion, and the replay stays there", async () => {
    stubCanvas();
    reduceMotion(true);
    const { w } = await mount();
    expect(tilt(w)).toBe("0°");
    await w.find("button").trigger("click");
    expect(tilt(w)).toBe("0°");
  });

  it("redraws on a theme change and draws nothing without a solution or a context", async () => {
    stubCanvas();
    reduceMotion(true);
    const { ctx, w } = await mount();
    const g = w.find("canvas").element.getContext("2d");
    if (g === null) throw new Error("no context");
    const put = vi.spyOn(g, "putImageData");
    ctx.theme.set("dark");
    await nextTick();
    await nextTick();
    expect(put).toHaveBeenCalled();
    const bare = await mount({ strike1: null, dip1: null, rake1: null, tAzimuth: null });
    expect(bare.w.find(".bowlball").exists()).toBe(false);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const blind = await mount();
    expect(blind.w.find("canvas").exists()).toBe(true);
  });
});
