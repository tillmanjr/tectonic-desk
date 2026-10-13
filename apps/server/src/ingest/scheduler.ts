import type { IngestContext } from "./context.js";
import { syncFeed, type FeedName, type FeedRunResult } from "./feed.js";

export interface SchedulerOptions {
  dayMs: number;
  weekMs: number;
  /** Injectable for tests; defaults to syncFeed. */
  run?: (ctx: IngestContext, name: FeedName) => Promise<FeedRunResult>;
}

export interface Scheduler {
  stop: () => Promise<void>;
}

/**
 * Runs the day feed now and every `dayMs`, the week feed every `weekMs`.
 * Ticks never overlap: if a run is in progress the tick is skipped.
 */
export function startScheduler(ctx: IngestContext, opts: SchedulerOptions): Scheduler {
  const run = opts.run ?? syncFeed;
  const timers = new Set<NodeJS.Timeout>();
  let inFlight: Promise<void> | null = null;

  const trigger = (name: FeedName): void => {
    if (inFlight) {
      ctx.log.warn({ feed: name }, "skipping tick: previous run still in progress");
      return;
    }
    inFlight = run(ctx, name)
      .then(
        () => undefined,
        (err: unknown) => {
          ctx.log.error({ err, feed: name }, "scheduled ingest run failed");
        },
      )
      .finally(() => {
        inFlight = null;
      });
  };

  // stop() clears timers synchronously, so a fired callback can never reschedule after it.
  const schedule = (name: FeedName, ms: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      trigger(name);
      schedule(name, ms);
    }, ms);
    timers.add(timer);
  };

  trigger("day");
  schedule("day", opts.dayMs);
  schedule("week", opts.weekMs);

  return {
    stop: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (inFlight) await inFlight;
    },
  };
}
