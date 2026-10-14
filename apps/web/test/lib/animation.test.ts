import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnimation } from "../../src/lib/animation.js";

const windowStart = new Date("2026-10-06T12:00:00Z");
const windowEnd = new Date("2026-10-13T12:00:00Z");

describe("createAnimation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens paused at 00:00 of the day before the window, in the zone", () => {
    const a = createAnimation();
    expect(a.active.value).toBe(false);
    a.open(windowStart, windowEnd, "utc");
    expect(a.active.value).toBe(true);
    expect(a.playing.value).toBe(false);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(a.end.value).toBe(windowEnd);
  });

  it("advances by seconds-per-day while playing, stops at the end, and restarts from the start", () => {
    const a = createAnimation(100);
    a.open(windowStart, windowEnd, "utc");
    a.secondsPerDay.value = 1;
    a.play();
    a.play();
    expect(a.playing.value).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    a.pause();
    vi.advanceTimersByTime(1000);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    a.play();
    vi.advanceTimersByTime(20_000);
    expect(a.cursor.value).toBe(windowEnd);
    expect(a.playing.value).toBe(false);
    a.play();
    expect(a.cursor.value?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    a.close();
  });

  it("guards against speeds at or below zero", () => {
    const a = createAnimation(100);
    a.open(windowStart, windowEnd, "utc");
    a.secondsPerDay.value = 0;
    a.play();
    vi.advanceTimersByTime(100);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    a.close();
  });

  it("steps whole days within the window and pauses", () => {
    const a = createAnimation();
    a.open(windowStart, windowEnd, "utc");
    a.stepDay(-1);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    a.play();
    a.stepDay(1);
    expect(a.playing.value).toBe(false);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    for (let i = 0; i < 12; i++) a.stepDay(1);
    expect(a.cursor.value?.toISOString()).toBe(windowEnd.toISOString());
    a.close();
  });

  it("ignores play and steps while closed, and clears state on close", () => {
    const a = createAnimation();
    a.play();
    a.stepDay(1);
    a.advance(1000);
    expect(a.playing.value).toBe(false);
    expect(a.cursor.value).toBeNull();
    a.open(windowStart, windowEnd, "utc");
    a.play();
    a.close();
    expect(a.active.value).toBe(false);
    expect(a.cursor.value).toBeNull();
    expect(a.start.value).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(a.cursor.value).toBeNull();
  });
});
