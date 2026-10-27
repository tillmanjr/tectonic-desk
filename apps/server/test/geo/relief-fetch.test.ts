import { describe, expect, it, vi } from "vitest";
import { fetchTileBytes, retryableTileError, TileHttpError } from "../../src/geo/relief-fetch.js";
import { recordingLogger } from "../support/fixtures.js";

const URL_ = "https://tiles.test/N00W180.jp2";
const http = (status: number) => new TileHttpError(status, URL_);
const ok = (text: string) => new Response(text, { status: 200 });
const sleeper = () => vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

describe("retryableTileError", () => {
  it("retries rate limits, server errors and non-http failures, not other 4xx", () => {
    expect(retryableTileError(http(429))).toBe(true);
    expect(retryableTileError(http(500))).toBe(true);
    expect(retryableTileError(http(503))).toBe(true);
    expect(retryableTileError(new Error("fetch failed"))).toBe(true);
    expect(retryableTileError(http(404))).toBe(false);
    expect(retryableTileError(http(400))).toBe(false);
  });
});

describe("fetchTileBytes", () => {
  it("returns the body on the first success without sleeping", async () => {
    const sleep = sleeper();
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(ok("tile")));
    const buf = await fetchTileBytes(URL_, { fetch, sleep });
    expect(buf.toString()).toBe("tile");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(URL_);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a 503 and a network error with doubling delays and warns each time", async () => {
    const sleep = sleeper();
    const log = recordingLogger();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(ok("tile"));
    const buf = await fetchTileBytes(URL_, { fetch, sleep, log, baseMs: 100 });
    expect(buf.toString()).toBe("tile");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
    expect(log.entries.map((e) => [e.level, e.obj, e.msg])).toEqual([
      [
        "warn",
        expect.objectContaining({
          url: URL_,
          attempt: 1,
          delayMs: 100,
          err: expect.any(TileHttpError),
        }),
        "relief tile fetch failed; retrying",
      ],
      [
        "warn",
        expect.objectContaining({ url: URL_, attempt: 2, delayMs: 200, err: expect.any(Error) }),
        "relief tile fetch failed; retrying",
      ],
    ]);
  });

  it("gives up after the attempts with the last error", async () => {
    const sleep = sleeper();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response("", { status: 502 })),
    );
    await expect(fetchTileBytes(URL_, { fetch, sleep, attempts: 3, baseMs: 1 })).rejects.toThrow(
      /502/,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("throws a 404 at once", async () => {
    const sleep = sleeper();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response("", { status: 404 })),
    );
    const err = await fetchTileBytes(URL_, { fetch, sleep }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TileHttpError);
    expect(err).toMatchObject({ status: 404, url: URL_ });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("aborts a stalled attempt after the timeout and retries", async () => {
    const sleep = sleeper();
    const log = recordingLogger();
    const stalled: typeof globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) throw new Error("no signal");
        signal.addEventListener("abort", () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
        });
      });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(stalled)
      .mockResolvedValueOnce(ok("tile"));
    const buf = await fetchTileBytes(URL_, { fetch, sleep, log, baseMs: 1, timeoutMs: 20 });
    expect(buf.toString()).toBe("tile");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.obj).toMatchObject({ attempt: 1, err: expect.any(Error) });
  });

  it("uses the global fetch and a timer-based sleep by default", async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok("tile"));
    try {
      const pending = fetchTileBytes(URL_, { baseMs: 50 });
      await vi.advanceTimersByTimeAsync(49);
      expect(spy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).toString()).toBe("tile");
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});
