import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/db/client.js";
import type { IngestContext } from "../../src/ingest/context.js";
import type { FeedName, FeedRunResult } from "../../src/ingest/feed.js";
import { startScheduler } from "../../src/ingest/scheduler.js";
import { recordingLogger } from "../support/fixtures.js";
import { stubUsgs } from "../support/usgs-stub.js";

const DAY = 1000;
const WEEK = 3500;

const emptyResult: FeedRunResult = {
  runId: 1,
  events: { inserted: 0, updated: 0, skipped: 0 },
  details: { candidates: 0, fetched: 0, failed: 0, mechanismsUpserted: 0 },
};

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const makeCtx = () => {
    const log = recordingLogger();
    const ctx: IngestContext = { db: {} as Db, usgs: stubUsgs(), log, now: () => new Date() };
    return { ctx, log };
  };

  it("runs the day feed immediately, then on its interval, and the week feed on its own interval", async () => {
    const { ctx } = makeCtx();
    const calls: FeedName[] = [];
    const run = (_c: IngestContext, name: FeedName) => {
      calls.push(name);
      return Promise.resolve(emptyResult);
    };
    const s = startScheduler(ctx, { dayMs: DAY, weekMs: WEEK, run });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["day"]);
    await vi.advanceTimersByTimeAsync(DAY);
    expect(calls).toEqual(["day", "day"]);
    await vi.advanceTimersByTimeAsync(WEEK - DAY);
    expect(calls).toEqual(["day", "day", "day", "day", "week"]);
    await s.stop();
    await vi.advanceTimersByTimeAsync(WEEK * 3);
    expect(calls).toHaveLength(5);
  });

  it("skips a tick while a run is in progress, logs failures, and recovers", async () => {
    const { ctx, log } = makeCtx();
    let release: () => void = () => undefined;
    let calls = 0;
    const run = () => {
      calls += 1;
      if (calls > 1) return Promise.resolve(emptyResult);
      return new Promise<FeedRunResult>((_resolve, reject) => {
        release = () => {
          reject(new Error("slow run failed"));
        };
      });
    };
    const s = startScheduler(ctx, { dayMs: DAY, weekMs: WEEK, run });
    await vi.advanceTimersByTimeAsync(DAY);
    expect(calls).toBe(1);
    expect(
      log.entries.some((e) => e.level === "warn" && (e.msg ?? "").includes("in progress")),
    ).toBe(true);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.entries.some((e) => e.level === "error" && (e.msg ?? "").includes("failed"))).toBe(
      true,
    );
    await vi.advanceTimersByTimeAsync(DAY);
    expect(calls).toBe(2);
    await s.stop();
  });

  it("stop waits for an in-flight run and cancels future ticks", async () => {
    const { ctx } = makeCtx();
    let release: () => void = () => undefined;
    let calls = 0;
    const run = () => {
      calls += 1;
      return new Promise<FeedRunResult>((resolve) => {
        release = () => {
          resolve(emptyResult);
        };
      });
    };
    const s = startScheduler(ctx, { dayMs: DAY, weekMs: WEEK, run });
    await vi.advanceTimersByTimeAsync(0);
    let stopped = false;
    const stopping = s.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(WEEK * 2);
    expect(calls).toBe(1);
  });

  it("runs extra jobs on their own lanes and intervals, and stop waits for them", async () => {
    const { ctx, log } = makeCtx();
    const feeds: FeedName[] = [];
    const run = (_c: IngestContext, name: FeedName) => {
      feeds.push(name);
      return Promise.resolve(emptyResult);
    };
    const ticks: string[] = [];
    let releaseSlow: () => void = () => undefined;
    const s = startScheduler(ctx, {
      dayMs: DAY,
      weekMs: WEEK,
      run,
      jobs: [
        {
          name: "fast",
          everyMs: 400,
          run: () => {
            ticks.push("fast");
            return Promise.resolve();
          },
        },
        {
          name: "slow",
          everyMs: 300,
          run: () =>
            new Promise<void>((resolve) => {
              ticks.push("slow");
              releaseSlow = resolve;
            }),
        },
        {
          name: "broken",
          everyMs: 10_000,
          run: () => Promise.reject(new Error("job broke")),
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(ticks).toEqual(["fast", "slow"]);
    expect(feeds).toEqual(["day"]);
    await vi.advanceTimersByTimeAsync(400);
    expect(ticks).toEqual(["fast", "slow", "fast"]);
    expect(
      log.entries.some((e) => e.level === "warn" && JSON.stringify(e.obj).includes("slow")),
    ).toBe(true);
    expect(
      log.entries.some((e) => e.level === "error" && JSON.stringify(e.obj).includes("broken")),
    ).toBe(true);
    let stopped = false;
    const stopping = s.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    releaseSlow();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ticks).toHaveLength(3);
  });

  it("uses syncFeed by default", async () => {
    const { ctx, log } = makeCtx();
    const s = startScheduler(ctx, { dayMs: DAY, weekMs: WEEK });
    await vi.advanceTimersByTimeAsync(0);
    await s.stop();
    expect(log.entries.some((e) => e.level === "error")).toBe(true);
  });
});
