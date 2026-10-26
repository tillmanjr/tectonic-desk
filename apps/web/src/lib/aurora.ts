import { AURORA_CELLS, type ApiAuroraFrameMeta } from "@tectonic/shared";
import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { errorMessage, type ApiClient } from "./api.js";
import { auroraBands, type AuroraBand } from "./aurora-bands.js";
import type { DocLike } from "./status.js";

/**
 * The aurora frames in store and the one on show. The index is polled every minute while the
 * Space page is open and visible; a grid is fetched when the frame on show changes and kept
 * in a small cache so a scrub back and forth costs nothing.
 */

export interface DecodedFrame extends ApiAuroraFrameMeta {
  grid: Uint8Array;
}

export interface AuroraStoreOptions {
  intervalMs?: number;
  doc?: DocLike;
}

export interface AuroraStore {
  /** Every frame in store, oldest first, without grids. */
  frames: ShallowRef<ApiAuroraFrameMeta[]>;
  /** The observation time on show, or null to follow the newest frame. */
  selected: Ref<string | null>;
  frame: ShallowRef<DecodedFrame | null>;
  /** The frame on show as probability bands; empty without a frame. */
  bands: ComputedRef<AuroraBand[]>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
  /** Shows a frame by observation time, or follows the newest with null. */
  select: (observed: string | null) => void;
  /** Fetches the index, then the grid of the frame on show. */
  load: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

/** How many grids the cache holds: a frame every five minutes is four hours of scrubbing. */
export const GRID_CACHE = 48;

/** The base64 grid as bytes; the length is checked so a bad answer fails loudly. */
export function decodeGrid(b64: string): Uint8Array {
  const bin = atob(b64);
  if (bin.length !== AURORA_CELLS) {
    throw new Error(`aurora grid has ${String(bin.length)} bytes, not ${String(AURORA_CELLS)}`);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createAuroraStore(api: ApiClient, opts: AuroraStoreOptions = {}): AuroraStore {
  const intervalMs = opts.intervalMs ?? 60_000;
  const doc: DocLike = opts.doc ?? document;
  const frames = shallowRef<ApiAuroraFrameMeta[]>([]);
  const selected = ref<string | null>(null);
  const frame = shallowRef<DecodedFrame | null>(null);
  const bands = computed(() => (frame.value === null ? [] : auroraBands(frame.value.grid)));
  const error = ref<string | null>(null);
  const loading = ref(false);
  const cache = new Map<string, Uint8Array>();
  let started = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let seq = 0;

  /** The frame on show: the selection when the index knows it, else the newest. */
  function showing(): ApiAuroraFrameMeta | null {
    const list = frames.value;
    const picked = list.find((f) => f.observed === selected.value);
    return picked ?? list[list.length - 1] ?? null;
  }

  function remember(observed: string, grid: Uint8Array): void {
    cache.set(observed, grid);
    for (const key of cache.keys()) {
      if (cache.size <= GRID_CACHE) break;
      cache.delete(key);
    }
  }

  async function gridOf(meta: ApiAuroraFrameMeta): Promise<Uint8Array> {
    const hit = cache.get(meta.observed);
    if (hit !== undefined) return hit;
    const grid = decodeGrid((await api.auroraFrame(meta.observed)).grid);
    remember(meta.observed, grid);
    return grid;
  }

  /** Puts the frame on show in `frame`, fetching its grid when needed; `mine` drops stale answers. */
  async function show(mine: number): Promise<void> {
    const meta = showing();
    if (meta === null) {
      frame.value = null;
      return;
    }
    const grid = await gridOf(meta);
    if (mine === seq) frame.value = { ...meta, grid };
  }

  /** Runs a step under a sequence number; a step a newer one has superseded changes nothing. */
  async function run(step: (mine: number) => Promise<void>): Promise<void> {
    const mine = ++seq;
    loading.value = true;
    try {
      await step(mine);
      if (mine === seq) error.value = null;
    } catch (e) {
      if (mine === seq) error.value = errorMessage(e);
    } finally {
      if (mine === seq) loading.value = false;
    }
  }

  function load(): Promise<void> {
    return run(async (mine) => {
      const index = await api.auroraIndex();
      if (mine !== seq) return;
      frames.value = index.frames;
      await show(mine);
    });
  }

  function tick(): void {
    void load();
  }
  function startTimer(): void {
    stopTimer();
    timer = setInterval(tick, intervalMs);
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
    frames,
    selected,
    frame,
    bands,
    error,
    loading,
    select(observed) {
      selected.value = observed;
      void run((mine) => show(mine));
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
