import {
  SUN_ARCHIVE_START,
  SUN_MOVIE_MAX_MS,
  type GeneratedMovie,
  type SunKey,
  type SunMovieSize,
} from "@tectonic/shared";
import type { IngestLogger } from "../ingest/context.js";
import type { HelioviewerClient } from "./helioviewer.js";

/**
 * Generated Sun movies: one Helioviewer build per channel, size and span, shared by every
 * reader who asks for it. Spans are rounded out to whole hours so "the last 7 days" asked a
 * minute apart is the same movie. A request queues the build once, then each later request
 * polls its status (at most every `POLL_MS`) until it is ready. Built movies are kept for
 * `READY_TTL_MS`, failures for `FAILED_TTL_MS` so a retry is possible soon after.
 */

const HOUR = 3_600_000;
export const POLL_MS = 2_000;
export const READY_TTL_MS = 6 * HOUR;
export const FAILED_TTL_MS = 60_000;
/** How many builds are remembered; the oldest go first. */
export const MAX_MOVIES = 200;

export class MovieRequestError extends Error {
  override name = "MovieRequestError";
}

/** The span rounded out to whole hours, checked against the archive and the length limit. */
export function movieSpan(key: SunKey, from: Date, to: Date): { from: Date; to: Date } {
  const f = new Date(Math.floor(from.getTime() / HOUR) * HOUR);
  const t = new Date(Math.ceil(to.getTime() / HOUR) * HOUR);
  if (t.getTime() <= f.getTime()) throw new MovieRequestError("the span must end after it starts");
  if (t.getTime() - f.getTime() > SUN_MOVIE_MAX_MS) {
    throw new MovieRequestError("the span may be at most 30 days");
  }
  if (f.getTime() < Date.parse(SUN_ARCHIVE_START[key])) {
    throw new MovieRequestError(`no ${key} images before ${SUN_ARCHIVE_START[key].slice(0, 10)}`);
  }
  return { from: f, to: t };
}

interface Job {
  movie: GeneratedMovie;
  /** Helioviewer's id once queued; the queue request itself is `pending`. */
  id: string | null;
  pending: Promise<void> | null;
  error: string | null;
  checkedAt: number;
  doneAt: number | null;
}

export interface SunMovieCacheOptions {
  client: HelioviewerClient;
  now?: () => Date;
  log?: Pick<IngestLogger, "warn">;
}

export interface SunMovieCache {
  /**
   * The movie for the channel, span and size: queued on first request, its state on later ones.
   * Throws `MovieRequestError` for a span it will not build and an Error when the build failed.
   */
  get: (key: SunKey, from: Date, to: Date, size: SunMovieSize) => Promise<GeneratedMovie>;
}

export function createSunMovieCache(opts: SunMovieCacheOptions): SunMovieCache {
  const now = opts.now ?? ((): Date => new Date());
  const jobs = new Map<string, Job>();

  function forget(): void {
    const t = now().getTime();
    for (const [k, j] of jobs) {
      const ttl = j.error === null ? READY_TTL_MS : FAILED_TTL_MS;
      if (j.doneAt !== null && t - j.doneAt >= ttl) jobs.delete(k);
    }
    for (const k of jobs.keys()) {
      if (jobs.size <= MAX_MOVIES) break;
      jobs.delete(k);
    }
  }

  function settle(job: Job, error: string | null): void {
    job.error = error;
    job.doneAt = now().getTime();
  }

  async function poll(job: Job, id: string): Promise<void> {
    const t = now().getTime();
    if (t - job.checkedAt < POLL_MS) return;
    job.checkedAt = t;
    const s = await opts.client.movieStatus(id);
    if (s.state === "ready") {
      job.movie = { ...job.movie, state: "ready", progress: null, url: s.url };
      settle(job, null);
    } else if (s.state === "failed") {
      settle(job, s.error);
    } else {
      job.movie = { ...job.movie, progress: s.progress };
    }
  }

  function start(key: SunKey, from: Date, to: Date, size: SunMovieSize): Job {
    const job: Job = {
      movie: { key, size, from, to, state: "building", progress: null, url: null },
      id: null,
      pending: null,
      error: null,
      checkedAt: now().getTime(),
      doneAt: null,
    };
    job.pending = opts.client
      .queueMovie(key, from, to, size)
      .then((id) => {
        job.id = id;
      })
      .catch((err: unknown) => {
        opts.log?.warn({ key, err }, "helioviewer refused a movie");
        settle(job, String(err));
      })
      .finally(() => {
        job.pending = null;
      });
    return job;
  }

  return {
    async get(key, fromAsked, toAsked, size) {
      const { from, to } = movieSpan(key, fromAsked, toAsked);
      forget();
      const id = `${key}/${String(size)}/${from.toISOString()}/${to.toISOString()}`;
      let job = jobs.get(id);
      if (job === undefined) {
        job = start(key, from, to, size);
        jobs.set(id, job);
      }
      if (job.pending !== null) await job.pending;
      // A queued job has its id or has failed; only a live one is polled.
      if (job.doneAt === null && job.id !== null) {
        try {
          await poll(job, job.id);
        } catch (err: unknown) {
          // A status request that fails is retried on the next poll; the build may be fine.
          opts.log?.warn({ key, err }, "helioviewer status unavailable");
        }
      }
      if (job.error !== null) throw new Error(job.error);
      return job.movie;
    },
  };
}
