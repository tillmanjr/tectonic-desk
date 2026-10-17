import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnimation, unitFor } from "../../src/lib/animation.js";

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
    a.secondsPerUnit.value = 1;
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
    a.secondsPerUnit.value = 0;
    a.play();
    vi.advanceTimersByTime(100);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    a.close();
  });

  it("steps whole days within the window and pauses", () => {
    const a = createAnimation();
    a.open(windowStart, windowEnd, "utc");
    a.step(-1);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    a.play();
    a.step(1);
    expect(a.playing.value).toBe(false);
    expect(a.cursor.value?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    for (let i = 0; i < 12; i++) a.step(1);
    expect(a.cursor.value?.toISOString()).toBe(windowEnd.toISOString());
    a.close();
  });

  it("picks the step unit from the window length", () => {
    const d = (days: number) => new Date(days * 864e5);
    expect(unitFor(d(0), d(120))).toBe("day");
    expect(unitFor(d(0), d(121))).toBe("month");
    expect(unitFor(d(0), d(15 * 365.25))).toBe("month");
    expect(unitFor(d(0), d(15 * 365.25 + 1))).toBe("year");
  });

  it("advances and steps by the unit over a long window", () => {
    const a = createAnimation(100);
    a.open(new Date("1900-01-01T00:00:00Z"), new Date("2026-10-13T12:00:00Z"), "utc");
    expect(a.unit.value).toBe("year");
    a.secondsPerUnit.value = 1;
    a.play();
    vi.advanceTimersByTime(1000);
    expect(a.cursor.value?.toISOString()).toBe("1900-12-31T00:00:00.000Z");
    a.step(1);
    expect(a.cursor.value?.toISOString()).toBe("1901-12-31T00:00:00.000Z");
    a.close();
    a.open(new Date("2024-01-01T00:00:00Z"), new Date("2026-10-13T12:00:00Z"), "utc");
    expect(a.unit.value).toBe("month");
    a.step(1);
    expect(a.cursor.value?.toISOString()).toBe("2024-01-30T00:00:00.000Z");
    a.close();
  });

  it("ignores play and steps while closed, and clears state on close", () => {
    const a = createAnimation();
    a.play();
    a.step(1);
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
