import {
  SUN_ARCHIVE_START,
  SUN_MOVIE_MAX_MS,
  type ApiSunMovie,
  type SunKey,
  type SunMovieSize,
} from "@tectonic/shared";
import { onUnmounted, ref, type Ref } from "vue";
import { errorMessage, type ApiClient } from "./api.js";
import type { SunMovie } from "./sun-movies.js";
import { rangeBounds, type SpaceRange } from "./space.js";

/**
 * Generated Sun movies on the web: which span the page's window asks for, whether the agency's
 * latest movie already covers it, and the polling while the server has Helioviewer build it.
 */

/** How long a window may end before now and still count as ending now, for coverage. */
const NOW_SLACK_MS = 3_600_000;
/** How often a building movie is asked after. */
export const MOVIE_POLL_MS = 3_000;

export interface MovieSpan {
  from: Date;
  to: Date;
  /** The window was longer than 30 days; the span is its last 30. */
  clipped: boolean;
  /** The window began before the channel's archive; the span starts at the archive. */
  trimmed: boolean;
}

const HOUR = 3_600_000;

/**
 * The span a generated movie would cover for the page's window, rounded out to whole hours as
 * the server builds it (so the dialog names the movie's real span), at most 30 days and not
 * before the channel's archive; null when no images exist for it.
 */
export function movieSpan(key: SunKey, range: SpaceRange, now: Date): MovieSpan | null {
  const b = rangeBounds(range, now);
  const end = Math.min(b.to.getTime(), now.getTime());
  const to = Math.ceil(end / HOUR) * HOUR;
  const start = Date.parse(SUN_ARCHIVE_START[key]);
  if (to <= start) return null;
  const earliest = to - SUN_MOVIE_MAX_MS;
  const asked = Math.floor(b.from.getTime() / HOUR) * HOUR;
  // Clipped when the window itself is longer, not when rounding out to hours tips it over.
  const clipped = end - b.from.getTime() > SUN_MOVIE_MAX_MS;
  const from = Math.max(asked, earliest);
  const trimmed = from < start;
  return { from: new Date(Math.max(from, start)), to: new Date(to), clipped, trimmed };
}

/** Whether the agency's latest movie already spans the page's window, so there is nothing to generate. */
export function coveredByLatest(movie: SunMovie, range: SpaceRange, now: Date): boolean {
  const b = rangeBounds(range, now);
  const endsNow = now.getTime() - b.to.getTime() <= NOW_SLACK_MS;
  return endsNow && b.to.getTime() - b.from.getTime() <= movie.hours * 3_600_000;
}

export type GenerateState = "idle" | "building" | "ready" | "error";

export interface GeneratedMovie {
  state: Ref<GenerateState>;
  /** Percent built, when the server knows. */
  progress: Ref<number | null>;
  /** The movie as the server last described it. */
  movie: Ref<ApiSunMovie | null>;
  error: Ref<string | null>;
  start(key: SunKey, span: MovieSpan, size: SunMovieSize): void;
  /** Stops waiting and forgets the movie; the server keeps building it for the next request. */
  stop(): void;
}

/** Asks the server for a movie and polls it until it is ready or fails. Call inside setup. */
export function useGeneratedMovie(api: ApiClient): GeneratedMovie {
  const state = ref<GenerateState>("idle");
  const progress = ref<number | null>(null);
  const movie = ref<ApiSunMovie | null>(null);
  const error = ref<string | null>(null);
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stop(): void {
    seq += 1;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    state.value = "idle";
    progress.value = null;
    movie.value = null;
    error.value = null;
  }
  function ask(token: number, key: SunKey, span: MovieSpan, size: SunMovieSize): void {
    api
      .sunMovie(key, span.from.toISOString(), span.to.toISOString(), size)
      .then((m) => {
        if (token !== seq) return;
        movie.value = m;
        progress.value = m.progress;
        if (m.state === "ready") {
          state.value = "ready";
          return;
        }
        timer = setTimeout(() => {
          timer = null;
          ask(token, key, span, size);
        }, MOVIE_POLL_MS);
      })
      .catch((e: unknown) => {
        if (token !== seq) return;
        state.value = "error";
        error.value = errorMessage(e);
      });
  }
  onUnmounted(stop);
  return {
    state,
    progress,
    movie,
    error,
    start(key, span, size) {
      stop();
      state.value = "building";
      ask(seq, key, span, size);
    },
    stop,
  };
}
