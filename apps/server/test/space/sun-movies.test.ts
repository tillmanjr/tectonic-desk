import { describe, expect, it, vi } from "vitest";
import type { HelioviewerClient, MovieStatus } from "../../src/space/helioviewer.js";
import {
  createSunMovieCache,
  FAILED_TTL_MS,
  MAX_MOVIES,
  MovieRequestError,
  movieSpan,
  POLL_MS,
  READY_TTL_MS,
} from "../../src/space/sun-movies.js";
import { recordingLogger } from "../support/fixtures.js";

const FROM = new Date("2026-11-16T00:20:00Z");
const TO = new Date("2026-11-17T00:10:00Z");

function clock(start = Date.parse("2026-11-23T00:00:00Z")) {
  let t = start;
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}
function stubClient(
  statuses: (MovieStatus | Error)[] = [],
  queue: () => Promise<string> = () => Promise.resolve("id1"),
) {
  const queued: string[] = [];
  const client: HelioviewerClient & { polls: number } = {
    polls: 0,
    queueMovie: (key, from, to, size) => {
      queued.push(`${key}/${String(size)}/${from.toISOString()}/${to.toISOString()}`);
      return queue();
    },
    movieStatus: () => {
      client.polls += 1;
      const next = statuses.shift() ?? { state: "building", progress: null };
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
  return { client, queued };
}

describe("movieSpan", () => {
  it("rounds out to whole hours", () => {
    expect(movieSpan("aia193", FROM, TO)).toEqual({
      from: new Date("2026-11-16T00:00:00Z"),
      to: new Date("2026-11-17T01:00:00Z"),
    });
  });

  it("refuses an empty or reversed span, one longer than 30 days, and one before the archive", () => {
    const t = new Date("2026-11-16T00:00:00Z");
    expect(() => movieSpan("aia193", t, t)).toThrow(MovieRequestError);
    expect(() => movieSpan("aia193", TO, FROM)).toThrow("the span must end after it starts");
    expect(() => movieSpan("aia193", new Date("2026-10-01T00:00:00Z"), TO)).toThrow(
      "the span may be at most 30 days",
    );
    expect(() =>
      movieSpan("hmii", new Date("2010-06-10T00:00:00Z"), new Date("2010-06-11T00:00:00Z")),
    ).toThrow("no hmii images before 2010-12-06");
    expect(
      movieSpan("c2", new Date("1998-01-01T00:00:00Z"), new Date("1998-01-02T00:00:00Z")).from,
    ).toEqual(new Date("1998-01-01T00:00:00Z"));
  });
});

describe("createSunMovieCache", () => {
  it("queues once, polls no faster than the interval, and serves the ready movie to everyone", async () => {
    const c = clock();
    const { client, queued } = stubClient([
      { state: "building", progress: 40 },
      { state: "ready", url: "https://h/m.mp4" },
    ]);
    const cache = createSunMovieCache({ client, now: c.now });
    const [a, b] = await Promise.all([
      cache.get("aia193", FROM, TO, 512),
      cache.get("aia193", FROM, TO, 512),
    ]);
    expect(queued).toEqual(["aia193/512/2026-11-16T00:00:00.000Z/2026-11-17T01:00:00.000Z"]);
    expect(a).toEqual({
      key: "aia193",
      size: 512,
      from: new Date("2026-11-16T00:00:00Z"),
      to: new Date("2026-11-17T01:00:00Z"),
      state: "building",
      progress: null,
      url: null,
    });
    expect(b).toBe(a);
    expect(client.polls).toBe(0);
    c.advance(POLL_MS - 1);
    await cache.get("aia193", FROM, TO, 512);
    expect(client.polls).toBe(0);
    c.advance(1);
    expect((await cache.get("aia193", FROM, TO, 512)).progress).toBe(40);
    c.advance(POLL_MS);
    const ready = await cache.get("aia193", FROM, TO, 512);
    expect(ready).toMatchObject({ state: "ready", url: "https://h/m.mp4", progress: null });
    c.advance(READY_TTL_MS - 1);
    expect(await cache.get("aia193", FROM, TO, 512)).toBe(ready);
    expect(client.polls).toBe(2);
    expect(queued).toHaveLength(1);
    // Kept for its ttl, then built afresh.
    c.advance(1);
    await cache.get("aia193", FROM, TO, 512);
    expect(queued).toHaveLength(2);
  });

  it("reports a failed build, forgets it after a minute, and rides out a failed status request", async () => {
    const c = clock();
    const log = recordingLogger();
    const { client, queued } = stubClient([
      new Error("status down"),
      { state: "failed", error: "encoder died" },
    ]);
    const cache = createSunMovieCache({ client, now: c.now, log });
    await cache.get("c2", FROM, TO, 1024);
    c.advance(POLL_MS);
    expect((await cache.get("c2", FROM, TO, 1024)).state).toBe("building");
    expect(log.entries.map((e) => e.msg)).toEqual(["helioviewer status unavailable"]);
    c.advance(POLL_MS);
    await expect(cache.get("c2", FROM, TO, 1024)).rejects.toThrow("encoder died");
    await expect(cache.get("c2", FROM, TO, 1024)).rejects.toThrow("encoder died");
    c.advance(FAILED_TTL_MS);
    await cache.get("c2", FROM, TO, 1024);
    expect(queued).toHaveLength(2);
  });

  it("reports a refused queue request, without a logger too", async () => {
    const { client } = stubClient([], () => Promise.reject(new Error("No images")));
    const logged = createSunMovieCache({ client, log: recordingLogger() });
    await expect(logged.get("c3", FROM, TO, 512)).rejects.toThrow("No images");
    const quiet = createSunMovieCache({ client });
    await expect(quiet.get("c3", FROM, TO, 512)).rejects.toThrow("No images");
  });

  it("rejects a bad span before asking Helioviewer, and drops the oldest past the cap", async () => {
    const c = clock();
    const { client, queued } = stubClient();
    const cache = createSunMovieCache({ client, now: c.now });
    await expect(cache.get("aia193", TO, FROM, 512)).rejects.toThrow(MovieRequestError);
    expect(queued).toHaveLength(0);
    const hour = 3_600_000;
    const shifted = (i: number) =>
      [new Date(FROM.getTime() + i * hour), new Date(TO.getTime() + i * hour)] as const;
    for (let i = 0; i <= MAX_MOVIES; i++) {
      const [f, t] = shifted(i);
      await cache.get("aia193", f, t, 512);
    }
    expect(queued).toHaveLength(MAX_MOVIES + 1);
    // The newest is still held; the oldest was dropped once the cap was passed.
    const [lf, lt] = shifted(MAX_MOVIES);
    await cache.get("aia193", lf, lt, 512);
    expect(queued).toHaveLength(MAX_MOVIES + 1);
    await cache.get("aia193", FROM, TO, 512);
    expect(queued).toHaveLength(MAX_MOVIES + 2);
  });

  it("uses the real clock by default", async () => {
    const { client } = stubClient();
    const cache = createSunMovieCache({ client });
    expect((await cache.get("hmib", FROM, TO, 512)).state).toBe("building");
    vi.restoreAllMocks();
  });
});
