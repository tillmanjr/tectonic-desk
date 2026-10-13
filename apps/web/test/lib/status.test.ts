import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusPoll } from "../../src/lib/status.js";
import { fakeApi, status } from "../support/api.js";

const now = () => new Date("2026-10-13T12:00:00Z");

describe("createStatusPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls on start and on the interval, calling back when the feed time changes", async () => {
    const api = fakeApi();
    vi.mocked(api.status)
      .mockResolvedValueOnce(status({ lastSuccessfulFeed: "2026-10-13T11:55:00.000Z" }))
      .mockResolvedValueOnce(status({ lastSuccessfulFeed: "2026-10-13T11:55:00.000Z" }))
      .mockResolvedValueOnce(status({ lastSuccessfulFeed: null }))
      .mockResolvedValueOnce(status({ lastSuccessfulFeed: "2026-10-13T12:00:00.000Z" }));
    const onFeed = vi.fn();
    const p = createStatusPoll(api, now, onFeed, { intervalMs: 1000 });
    p.start();
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.status.value?.events.total).toBe(7269);
    expect(p.fetchedAt.value?.toISOString()).toBe("2026-10-13T12:00:00.000Z");
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFeed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFeed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFeed).toHaveBeenCalledTimes(1);
    p.stop();
    p.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.status).toHaveBeenCalledTimes(4);
  });

  it("does not call back on the first poll even with a feed time", async () => {
    const onFeed = vi.fn();
    const p = createStatusPoll(fakeApi(), now, onFeed, { intervalMs: 1000 });
    await p.poll();
    expect(onFeed).not.toHaveBeenCalled();
  });

  it("records the first failure time and clears it on recovery", async () => {
    const api = fakeApi();
    vi.mocked(api.status)
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("still"));
    const p = createStatusPoll(api, now, () => undefined);
    await p.poll();
    expect(p.error.value).toBe("down");
    expect(p.errorSince.value?.toISOString()).toBe("2026-10-13T12:00:00.000Z");
    await p.poll();
    expect(p.error.value).toBe("still");
    await p.poll();
    expect(p.error.value).toBeNull();
    expect(p.errorSince.value).toBeNull();
  });

  it("pauses while hidden and polls at once when visible again", async () => {
    const api = fakeApi();
    const doc = { hidden: false, listeners: [] as (() => void)[] };
    const docLike = {
      get hidden() {
        return doc.hidden;
      },
      addEventListener: (_: string, fn: () => void) => {
        doc.listeners.push(fn);
      },
      removeEventListener: (_: string, fn: () => void) => {
        doc.listeners = doc.listeners.filter((l) => l !== fn);
      },
    };
    const p = createStatusPoll(api, now, () => undefined, { intervalMs: 1000, doc: docLike });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.status).toHaveBeenCalledTimes(1);
    doc.hidden = true;
    doc.listeners.forEach((l) => {
      l();
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.status).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    doc.listeners.forEach((l) => {
      l();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.status).toHaveBeenCalledTimes(3);
    p.stop();
    expect(doc.listeners).toHaveLength(0);
  });

  it("uses the document by default", async () => {
    const p = createStatusPoll(fakeApi(), now, () => undefined);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    expect(p.status.value).not.toBeNull();
  });
});
