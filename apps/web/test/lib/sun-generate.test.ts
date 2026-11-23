import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import {
  coveredByLatest,
  MOVIE_POLL_MS,
  movieSpan,
  useGeneratedMovie,
  type GeneratedMovie,
} from "../../src/lib/sun-generate.js";
import { SUN_MOVIES } from "../../src/lib/sun-movies.js";
import { fakeApi } from "../support/api.js";
import { sunMovie } from "../support/space.js";

const NOW = new Date("2026-11-23T05:22:00Z");
const DAY = 86_400_000;

describe("movieSpan", () => {
  it("rounds a preset window out to whole hours", () => {
    expect(movieSpan("aia193", { kind: "window", id: "7d" }, NOW)).toEqual({
      from: new Date("2026-11-16T05:00:00Z"),
      to: new Date("2026-11-23T06:00:00Z"),
      clipped: false,
      trimmed: false,
    });
  });

  it("does not call a 30-day window clipped when rounding to hours tips it past 30 days", () => {
    const s = movieSpan("aia193", { kind: "window", id: "30d" }, NOW);
    expect(s?.clipped).toBe(false);
    expect((s?.to.getTime() ?? 0) - (s?.from.getTime() ?? 0)).toBe(30 * DAY);
  });

  it("keeps the last 30 days of a longer window, and never runs past now", () => {
    const s = movieSpan("c2", { kind: "window", id: "1y" }, NOW);
    expect(s?.clipped).toBe(true);
    expect((s?.to.getTime() ?? 0) - (s?.from.getTime() ?? 0)).toBe(30 * DAY);
    const future = {
      kind: "fixed" as const,
      from: new Date("2026-11-22T00:00:00Z"),
      to: new Date("2026-12-01T00:00:00Z"),
    };
    expect(movieSpan("c2", future, NOW)?.to).toEqual(new Date("2026-11-23T06:00:00Z"));
  });

  it("starts at the archive for a window reaching before it, and offers nothing wholly before it", () => {
    const early = {
      kind: "fixed" as const,
      from: new Date("2010-11-20T00:00:00Z"),
      to: new Date("2010-12-10T00:00:00Z"),
    };
    expect(movieSpan("hmii", early, NOW)).toEqual({
      from: new Date("2010-12-06T00:00:00Z"),
      to: new Date("2010-12-10T00:00:00Z"),
      clipped: false,
      trimmed: true,
    });
    const before = { ...early, to: new Date("2010-12-01T00:00:00Z") };
    expect(movieSpan("hmii", before, NOW)).toBeNull();
  });
});

describe("coveredByLatest", () => {
  it("is true only for a window ending about now and no longer than the movie", () => {
    const sdo = SUN_MOVIES.aia193;
    expect(coveredByLatest(sdo, { kind: "window", id: "24h" }, NOW)).toBe(true);
    expect(coveredByLatest(sdo, { kind: "window", id: "3d" }, NOW)).toBe(false);
    expect(coveredByLatest(SUN_MOVIES.c2, { kind: "window", id: "3d" }, NOW)).toBe(true);
    const past = {
      kind: "fixed" as const,
      from: new Date("2026-11-20T00:00:00Z"),
      to: new Date("2026-11-21T00:00:00Z"),
    };
    expect(coveredByLatest(sdo, past, NOW)).toBe(false);
  });
});

describe("useGeneratedMovie", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const span = {
    from: new Date("2026-11-16T05:00:00Z"),
    to: new Date("2026-11-23T06:00:00Z"),
    clipped: false,
    trimmed: false,
  };
  function host(api = fakeApi()) {
    const held: { gen?: GeneratedMovie } = {};
    const w = mount(
      defineComponent({
        setup() {
          held.gen = useGeneratedMovie(api);
          return () => h("div");
        },
      }),
    );
    const { gen } = held;
    if (gen === undefined) throw new Error("not set up");
    return { w, gen, api };
  }

  it("polls a building movie until it is ready", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    vi.mocked(api.sunMovie)
      .mockResolvedValueOnce(sunMovie({ state: "building", progress: null, url: null }))
      .mockResolvedValueOnce(sunMovie({ state: "building", progress: 52, url: null }));
    const { w, gen } = host(api);
    expect(gen.state.value).toBe("idle");
    gen.start("aia304", span, 1024);
    expect(gen.state.value).toBe("building");
    expect(api.sunMovie).toHaveBeenCalledWith(
      "aia304",
      "2026-11-16T05:00:00.000Z",
      "2026-11-23T06:00:00.000Z",
      1024,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(gen.progress.value).toBeNull();
    await vi.advanceTimersByTimeAsync(MOVIE_POLL_MS);
    expect(gen.progress.value).toBe(52);
    await vi.advanceTimersByTimeAsync(MOVIE_POLL_MS);
    expect(gen.state.value).toBe("ready");
    expect(gen.movie.value?.url).toContain("helioviewer");
    expect(api.sunMovie).toHaveBeenCalledTimes(3);
    w.unmount();
  });

  it("reports a failure, and ignores answers after stopping", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    vi.mocked(api.sunMovie).mockRejectedValueOnce(new Error("the movie could not be built"));
    const { w, gen } = host(api);
    gen.start("c2", span, 512);
    await vi.advanceTimersByTimeAsync(0);
    expect(gen.state.value).toBe("error");
    expect(gen.error.value).toBe("the movie could not be built");
    // Stopped while building: the pending answer and the poll are dropped.
    vi.mocked(api.sunMovie).mockResolvedValueOnce(sunMovie({ state: "building", url: null }));
    gen.start("c2", span, 512);
    await vi.advanceTimersByTimeAsync(0);
    gen.stop();
    await vi.advanceTimersByTimeAsync(MOVIE_POLL_MS * 2);
    expect(gen.state.value).toBe("idle");
    expect(api.sunMovie).toHaveBeenCalledTimes(2);
    let late: (e: Error) => void = () => undefined;
    vi.mocked(api.sunMovie).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          late = reject;
        }),
    );
    gen.start("c2", span, 512);
    vi.mocked(api.sunMovie).mockImplementationOnce(() => new Promise(() => undefined));
    gen.start("c3", span, 512);
    late(new Error("stale"));
    await vi.advanceTimersByTimeAsync(0);
    expect(gen.state.value).toBe("building");
    vi.mocked(api.sunMovie).mockResolvedValueOnce(sunMovie());
    gen.start("aia193", span, 512);
    gen.start("aia193", span, 512);
    await vi.advanceTimersByTimeAsync(0);
    w.unmount();
    expect(gen.state.value).toBe("idle");
  });
});
