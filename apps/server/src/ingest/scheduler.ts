import type { IngestContext } from "./context.js";
import { syncFeed, type FeedName, type FeedRunResult } from "./feed.js";

/** An extra periodic job beside the USGS feeds, e.g. the volcano polls. */
export interface ScheduledJob {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

export interface SchedulerOptions {
  dayMs: number;
  weekMs: number;
  /** Injectable for tests; defaults to syncFeed. */
  run?: (ctx: IngestContext, name: FeedName) => Promise<FeedRunResult>;
  jobs?: ScheduledJob[];
}

export interface Scheduler {
  stop: () => Promise<void>;
}

/**
 * Runs the day feed now and every `dayMs`, the week feed every `weekMs`, and
 * each extra job now and every `everyMs`. The two feeds share one lane and
 * every job has its own: a tick whose lane is busy is skipped.
 */
export function startScheduler(ctx: IngestContext, opts: SchedulerOptions): Scheduler {
  const run = opts.run ?? syncFeed;
  const timers = new Set<NodeJS.Timeout>();
  const lanes = new Map<string, Promise<void>>();

  const trigger = (lane: string, label: string, job: () => Promise<unknown>): void => {
    if (lanes.has(lane)) {
      ctx.log.warn({ job: label }, "skipping tick: previous run still in progress");
      return;
    }
    const p = job()
      .then(
        () => undefined,
        (err: unknown) => {
          ctx.log.error({ err, job: label }, "scheduled ingest run failed");
        },
      )
      .finally(() => {
        lanes.delete(lane);
      });
    lanes.set(lane, p);
  };

  // stop() clears timers synchronously, so a fired callback can never reschedule after it.
  const schedule = (lane: string, label: string, ms: number, job: () => Promise<unknown>): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      trigger(lane, label, job);
      schedule(lane, label, ms, job);
    }, ms);
    timers.add(timer);
  };

  const feed = (name: FeedName) => () => run(ctx, name);
  trigger("feeds", "day", feed("day"));
  schedule("feeds", "day", opts.dayMs, feed("day"));
  schedule("feeds", "week", opts.weekMs, feed("week"));
  for (const job of opts.jobs ?? []) {
    trigger(job.name, job.name, job.run);
    schedule(job.name, job.name, job.everyMs, job.run);
  }

  return {
    stop: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await Promise.all(lanes.values());
    },
  };
}
