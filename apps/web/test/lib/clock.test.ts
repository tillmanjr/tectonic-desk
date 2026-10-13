import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClock } from "../../src/lib/clock.js";

describe("createClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("ticks on the interval while started, idempotently", () => {
    let t = 0;
    const clock = createClock(1000, () => new Date(t));
    expect(clock.now.value.getTime()).toBe(0);
    clock.start();
    clock.start();
    t = 5;
    vi.advanceTimersByTime(1000);
    expect(clock.now.value.getTime()).toBe(5);
    clock.stop();
    clock.stop();
    t = 9;
    vi.advanceTimersByTime(1000);
    expect(clock.now.value.getTime()).toBe(5);
  });
  it("defaults to the system clock", () => {
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    expect(createClock().now.value.toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });
});
