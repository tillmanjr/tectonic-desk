import type { ApiSpaceNow, ApiSpaceWindow } from "@tectonic/shared";
import { ref, shallowRef, type Ref, type ShallowRef } from "vue";
import { errorMessage, type ApiClient } from "./api.js";
import type { DocLike } from "./status.js";

/**
 * The Space page's state: the latest readings and one window of series, refreshed every
 * minute while the window ends at now. The range lives in the route (`?window=` or
 * `?from=&to=`); `App.vue` reads it with `parseSpaceRange` and hands it to `setRange`.
 */

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

/** The lengths on offer; `all` has no length of its own and starts at `HISTORY_START`. */
export const WINDOWS = [
  { id: "6h", label: "6 hours", ms: 6 * 3_600_000 },
  { id: "24h", label: "24 hours", ms: 24 * 3_600_000 },
  { id: "3d", label: "3 days", ms: 3 * DAY },
  { id: "7d", label: "7 days", ms: 7 * DAY },
  { id: "30d", label: "30 days", ms: 30 * DAY },
  { id: "1y", label: "1 year", ms: YEAR },
  { id: "11y", label: "11 years", ms: 11 * YEAR },
  { id: "all", label: "Since 1932", ms: null },
] as const;
export type WindowId = (typeof WINDOWS)[number]["id"];
export const DEFAULT_WINDOW: WindowId = "24h";
/** The first GFZ Kp value; where `Since 1932` begins. */
export const HISTORY_START = new Date("1932-01-01T00:00:00Z");
/** The longest fixed range the server serves. */
export const MAX_RANGE_MS = 36_525 * DAY;
/** Past this the stack shows the long record: flares, alerts and the minute-scale rows drop out. */
export const LONG_RANGE_MS = 93 * DAY;
export const isLongRange = (from: Date, to: Date): boolean =>
  to.getTime() - from.getTime() > LONG_RANGE_MS;
/** A long range is polled this often instead of every minute: its points are days wide. */
export const LONG_INTERVAL_MS = 600_000;

export type SpaceRange = { kind: "window"; id: WindowId } | { kind: "fixed"; from: Date; to: Date };

export const isWindowId = (v: unknown): v is WindowId => WINDOWS.some((w) => w.id === v);

/** An instant from a query value: a finite date, else null. */
function instantOf(v: unknown): Date | null {
  if (typeof v !== "string" || v === "") return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** `from` and `to` win when both parse and bound a span up to the cap; else `window`; else the default. */
export function parseSpaceRange(query: Record<string, unknown>): SpaceRange {
  const from = instantOf(query.from);
  const to = instantOf(query.to);
  if (from !== null && to !== null) {
    const span = to.getTime() - from.getTime();
    if (span > 0 && span <= MAX_RANGE_MS) return { kind: "fixed", from, to };
  }
  const id = query.window;
  return { kind: "window", id: isWindowId(id) ? id : DEFAULT_WINDOW };
}

/** An instant for the route, to the minute: `2026-10-23T21:35Z`. */
export const routeInstant = (d: Date): string => `${d.toISOString().slice(0, 16)}Z`;

/** The query keys for a range; the default window writes nothing. */
export function spaceRangeQuery(r: SpaceRange): {
  window: string | undefined;
  from: string | undefined;
  to: string | undefined;
} {
  if (r.kind === "fixed") {
    return { window: undefined, from: routeInstant(r.from), to: routeInstant(r.to) };
  }
  return { window: r.id === DEFAULT_WINDOW ? undefined : r.id, from: undefined, to: undefined };
}

const WINDOW_MS: Record<WindowId, number | null> = {
  "6h": WINDOWS[0].ms,
  "24h": WINDOWS[1].ms,
  "3d": WINDOWS[2].ms,
  "7d": WINDOWS[3].ms,
  "30d": WINDOWS[4].ms,
  "1y": WINDOWS[5].ms,
  "11y": WINDOWS[6].ms,
  all: WINDOWS[7].ms,
};
/** A window's length ending at `now`; `all` reaches back to `HISTORY_START`. */
export const windowMs = (id: WindowId, now: Date): number =>
  WINDOW_MS[id] ?? now.getTime() - HISTORY_START.getTime();

const WINDOW_LABEL: Record<WindowId, string> = {
  "6h": WINDOWS[0].label,
  "24h": WINDOWS[1].label,
  "3d": WINDOWS[2].label,
  "7d": WINDOWS[3].label,
  "30d": WINDOWS[4].label,
  "1y": WINDOWS[5].label,
  "11y": WINDOWS[6].label,
  all: WINDOWS[7].label,
};
export const windowLabel = (id: WindowId): string => WINDOW_LABEL[id];

/** The instants a range covers: a window ends at now. */
export function rangeBounds(r: SpaceRange, now: Date): { from: Date; to: Date } {
  if (r.kind === "fixed") return { from: r.from, to: r.to };
  return { from: new Date(now.getTime() - windowMs(r.id, now)), to: now };
}

export interface SpaceStoreOptions {
  intervalMs?: number;
  /** The poll interval while the range is long; default `LONG_INTERVAL_MS`. */
  longIntervalMs?: number;
  doc?: DocLike;
}

export interface SpaceStore {
  now: ShallowRef<ApiSpaceNow | null>;
  window: ShallowRef<ApiSpaceWindow | null>;
  range: Ref<SpaceRange>;
  /** The window last in force, which a fixed range (a framed flare) returns to. */
  lastWindow: Ref<WindowId>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
  /** Replaces the range and reloads when started. */
  setRange: (r: SpaceRange) => void;
  /** Fetches the latest readings and the window for the range in force. */
  load: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

export function createSpaceStore(
  api: ApiClient,
  readNow: () => Date,
  opts: SpaceStoreOptions = {},
): SpaceStore {
  const intervalMs = opts.intervalMs ?? 60_000;
  const longIntervalMs = opts.longIntervalMs ?? LONG_INTERVAL_MS;
  const doc: DocLike = opts.doc ?? document;
  const now = shallowRef<ApiSpaceNow | null>(null);
  const window = shallowRef<ApiSpaceWindow | null>(null);
  const range = ref<SpaceRange>({ kind: "window", id: DEFAULT_WINDOW });
  const lastWindow = ref<WindowId>(DEFAULT_WINDOW);
  const error = ref<string | null>(null);
  const loading = ref(false);
  let started = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let seq = 0;

  async function load(): Promise<void> {
    const mine = ++seq;
    loading.value = true;
    const { from, to } = rangeBounds(range.value, readNow());
    try {
      const [n, w] = await Promise.all([
        api.spaceNow(),
        api.spaceWindow(from.toISOString(), to.toISOString()),
      ]);
      if (mine !== seq) return;
      now.value = n;
      window.value = w;
      error.value = null;
    } catch (e) {
      if (mine !== seq) return;
      error.value = errorMessage(e);
    } finally {
      if (mine === seq) loading.value = false;
    }
  }

  /** A fixed range never changes, so only a window is polled. */
  function tick(): void {
    if (range.value.kind === "window") void load();
  }
  /** The interval for the range in force: a long range changes slowly and costs more to read. */
  function pollMs(): number {
    const { from, to } = rangeBounds(range.value, readNow());
    return isLongRange(from, to) ? longIntervalMs : intervalMs;
  }
  function startTimer(): void {
    stopTimer();
    timer = setInterval(tick, pollMs());
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
      tick();
      startTimer();
    }
  }

  return {
    now,
    window,
    range,
    lastWindow,
    error,
    loading,
    setRange(r) {
      range.value = r;
      if (r.kind === "window") lastWindow.value = r.id;
      if (started) {
        void load();
        if (!doc.hidden) startTimer();
      }
    },
    load,
    start() {
      if (started) return;
      started = true;
      void load();
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
