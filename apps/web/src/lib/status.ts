import type { ApiStatus } from "@tectonic/shared";
import { ref, type Ref } from "vue";
import { errorMessage, type ApiClient } from "./api.js";

export interface DocLike {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface StatusPollOptions {
  intervalMs?: number;
  doc?: DocLike;
}

export interface StatusPoll {
  status: Ref<ApiStatus | null>;
  error: Ref<string | null>;
  /** When the current run of failures began; null while healthy. */
  errorSince: Ref<Date | null>;
  fetchedAt: Ref<Date | null>;
  poll(): Promise<void>;
  start(): void;
  stop(): void;
}

/**
 * Polls `GET /api/status`. `onFeedChange` fires when `lastSuccessfulFeed`
 * differs from the previous non-null value, which is the signal to refetch
 * events. Polling pauses while the document is hidden.
 */
export function createStatusPoll(
  api: ApiClient,
  now: () => Date,
  onFeedChange: () => void,
  opts: StatusPollOptions = {},
): StatusPoll {
  const intervalMs = opts.intervalMs ?? 60_000;
  const doc: DocLike = opts.doc ?? document;
  const status = ref<ApiStatus | null>(null);
  const error = ref<string | null>(null);
  const errorSince = ref<Date | null>(null);
  const fetchedAt = ref<Date | null>(null);
  let lastFeed: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let started = false;

  async function poll(): Promise<void> {
    try {
      const s = await api.status();
      status.value = s;
      error.value = null;
      errorSince.value = null;
      if (lastFeed !== null && s.lastSuccessfulFeed !== null && s.lastSuccessfulFeed !== lastFeed) {
        onFeedChange();
      }
      lastFeed = s.lastSuccessfulFeed ?? lastFeed;
    } catch (e) {
      error.value = errorMessage(e);
      errorSince.value ??= now();
    }
    fetchedAt.value = now();
  }

  function startTimer(): void {
    stopTimer();
    timer = setInterval(() => void poll(), intervalMs);
  }
  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }
  function onVisibility(): void {
    if (doc.hidden) {
      stopTimer();
    } else {
      void poll();
      startTimer();
    }
  }

  return {
    status,
    error,
    errorSince,
    fetchedAt,
    poll,
    start() {
      if (started) return;
      started = true;
      void poll();
      startTimer();
      doc.addEventListener("visibilitychange", onVisibility);
    },
    stop() {
      if (!started) return;
      started = false;
      stopTimer();
      doc.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
