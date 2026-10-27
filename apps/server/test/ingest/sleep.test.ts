import { afterEach, describe, expect, it, vi } from "vitest";
import { sleep } from "../../src/ingest/sleep.js";

describe("sleep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves once the timer has run", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = sleep(50).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });
});
