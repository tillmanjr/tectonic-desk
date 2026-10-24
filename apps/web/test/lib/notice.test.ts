import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotice, NOTICE_MS } from "../../src/lib/notice.js";

describe("notice", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a text for a while, restarting the timer on a new post", () => {
    vi.useFakeTimers();
    const n = createNotice();
    expect(n.current.value).toBeNull();
    n.post("Switching to Active Earth");
    expect(n.current.value).toBe("Switching to Active Earth");
    vi.advanceTimersByTime(NOTICE_MS - 1);
    n.post("Second");
    vi.advanceTimersByTime(NOTICE_MS - 1);
    expect(n.current.value).toBe("Second");
    vi.advanceTimersByTime(1);
    expect(n.current.value).toBeNull();
  });

  it("takes a custom duration and clears on demand", () => {
    vi.useFakeTimers();
    const n = createNotice();
    n.post("Short", 100);
    vi.advanceTimersByTime(99);
    expect(n.current.value).toBe("Short");
    vi.advanceTimersByTime(1);
    expect(n.current.value).toBeNull();
    n.post("Gone");
    n.clear();
    expect(n.current.value).toBeNull();
    n.clear();
    vi.advanceTimersByTime(NOTICE_MS);
    expect(n.current.value).toBeNull();
  });
});
