import { describe, expect, it, vi } from "vitest";
import {
  createHelioviewerClient,
  HELIOVIEWER_BASE,
  MAX_FRAMES,
  queueUrl,
  statusUrl,
} from "../../src/space/helioviewer.js";

const FROM = new Date("2026-11-16T00:00:00Z");
const TO = new Date("2026-11-17T00:00:00Z");

function answering(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("helioviewer", () => {
  it("asks for the channel's layer framed at its scale, halving the scale at 1024 px", () => {
    const q = new URL(queueUrl("aia193", FROM, TO, 512));
    expect(q.href.startsWith(`${HELIOVIEWER_BASE}queueMovie/?`)).toBe(true);
    expect(q.searchParams.get("layers")).toBe("[SDO,AIA,AIA,193,1,100]");
    expect(q.searchParams.get("startTime")).toBe("2026-11-16T00:00:00.000Z");
    expect(q.searchParams.get("endTime")).toBe("2026-11-17T00:00:00.000Z");
    expect(q.searchParams.get("imageScale")).toBe("4.8");
    expect(q.searchParams.get("width")).toBe("512");
    expect(q.searchParams.get("maxFrames")).toBe(String(MAX_FRAMES));
    expect(q.searchParams.get("format")).toBe("mp4");
    const c3 = new URL(queueUrl("c3", FROM, TO, 1024));
    expect(c3.searchParams.get("layers")).toBe("[SOHO,LASCO,C3,white-light,1,100]");
    expect(c3.searchParams.get("imageScale")).toBe("56.25");
    expect(c3.searchParams.get("height")).toBe("1024");
    expect(new URL(queueUrl("hmib", FROM, TO, 512)).searchParams.get("layers")).toBe(
      "[SDO,HMI,HMI,magnetogram,1,100]",
    );
    expect(statusUrl("abc")).toBe(
      `${HELIOVIEWER_BASE}getMovieStatus/?id=abc&format=mp4&verbose=true`,
    );
  });

  it("queues a movie and returns its id, sending the user agent", async () => {
    const fetchFn = answering({ id: "lRmp5", eta: 10 });
    const c = createHelioviewerClient({ fetch: fetchFn, userAgent: "test/1" });
    expect(await c.queueMovie("aia193", FROM, TO, 512)).toBe("lRmp5");
    const init = fetchFn.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("user-agent")).toBe("test/1");
  });

  it("throws when Helioviewer refuses, answers an error status or an unexpected body", async () => {
    const refused = createHelioviewerClient({
      fetch: answering({ error: "No images" }),
      userAgent: "t",
    });
    await expect(refused.queueMovie("c2", FROM, TO, 512)).rejects.toThrow(
      "helioviewer refused the movie: No images",
    );
    const down = createHelioviewerClient({ fetch: answering({}, 503), userAgent: "t" });
    await expect(down.queueMovie("c2", FROM, TO, 512)).rejects.toThrow(/503/);
    const odd = createHelioviewerClient({ fetch: answering({ nothing: 1 }), userAgent: "t" });
    await expect(odd.queueMovie("c2", FROM, TO, 512)).rejects.toThrow();
  });

  it("reads a status as building with percent progress, ready with its URL, or failed", async () => {
    const status = async (body: unknown) =>
      createHelioviewerClient({ fetch: answering(body), userAgent: "t" }).movieStatus("x");
    expect(await status({ status: 0 })).toEqual({ state: "building", progress: null });
    expect(await status({ status: 1, progress: 0.52 })).toEqual({
      state: "building",
      progress: 52,
    });
    expect(await status({ status: 1, progress: null })).toEqual({
      state: "building",
      progress: null,
    });
    expect(await status({ status: 2, url: "https://h/x.mp4" })).toEqual({
      state: "ready",
      url: "https://h/x.mp4",
    });
    expect(await status({ status: 2 })).toEqual({
      state: "failed",
      error: "helioviewer could not build the movie",
    });
    expect(await status({ status: 3, error: "encoder died" })).toEqual({
      state: "failed",
      error: "encoder died",
    });
  });

  it("aborts after the timeout and uses global fetch by default", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const c = createHelioviewerClient({ fetch: hanging, userAgent: "t", timeoutMs: 50 });
    const p = c.movieStatus("x");
    vi.advanceTimersByTime(50);
    await expect(p).rejects.toThrow("aborted");
    vi.useRealTimers();
    const g = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", g);
    await createHelioviewerClient({ userAgent: "t" }).movieStatus("y");
    expect(g).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
