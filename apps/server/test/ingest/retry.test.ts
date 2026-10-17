import { describe, expect, it, vi } from "vitest";
import { retryable, withRetry } from "../../src/ingest/retry.js";
import { UsgsHttpError } from "../../src/usgs/client.js";
import { recordingLogger } from "../support/fixtures.js";

const http = (status: number) => new UsgsHttpError(status, "https://x.test/q");

describe("retry", () => {
  it("classifies rate limits, server errors and non-http failures as retryable", () => {
    expect(retryable(http(429))).toBe(true);
    expect(retryable(http(503))).toBe(true);
    expect(retryable(http(500))).toBe(true);
    expect(retryable(new Error("fetch failed"))).toBe(true);
    expect(retryable(http(400))).toBe(false);
    expect(retryable(http(404))).toBe(false);
  });

  it("retries with doubling delays and returns the first success", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const log = recordingLogger();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(http(503))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep, log, baseMs: 100 })).resolves.toBe("ok");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
    expect(log.entries.map((e) => [e.level, e.obj])).toEqual([
      ["warn", expect.objectContaining({ attempt: 1, delayMs: 100 })],
      ["warn", expect.objectContaining({ attempt: 2, delayMs: 200 })],
    ]);
  });

  it("gives up after the attempts and never retries a 4xx", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const log = recordingLogger();
    const always = vi.fn(() => Promise.reject(http(503)));
    await expect(withRetry(always, { sleep, log, attempts: 3, baseMs: 1 })).rejects.toThrow(
      /503/,
    );
    expect(always).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    const bad = vi.fn(() => Promise.reject(http(400)));
    await expect(withRetry(bad, { sleep, log })).rejects.toThrow(/400/);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
