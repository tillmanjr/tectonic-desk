import { computed, ref, shallowRef, type ComputedRef, type InjectionKey, type Ref } from "vue";
import type { Page } from "../router.js";
import type { MapView } from "./mapview.js";
import type { Section } from "./section.js";
import { domSwitches, type Switches } from "./tour-target.js";

/**
 * The quick tours: a runner that walks a tour's steps through the real app (a step may switch
 * page, select an event or set a map tool going) and puts the reader's view back when the tour
 * ends, and the reader's progress through each tour, kept in localStorage.
 */

export type TourId = "orientation" | "map" | "earthquakes" | "mechanism";

/** What a step acts through, built by `App.vue`; `map` resolves once a map is on screen. */
export interface TourStage {
  page: () => Page;
  goPage: (p: Page) => Promise<void>;
  /** Selects the largest event in the window (none when the window is empty). */
  selectLargest: () => void;
  clearSelection: () => void;
  /** Replaces the route with a path and query of the app's own, as a pasted link would open it. */
  go: (url: string) => Promise<void>;
  setSection: (s: Section | null) => void;
  /** The route as it stands, for `restore`. */
  location: () => string;
  restore: (location: string) => Promise<void>;
}

/** The stage as a step sees it, with the map on screen (recorded for the restore on first use). */
export interface StepContext extends TourStage {
  map: () => Promise<MapView | null>;
  /**
   * Turns a named switch (a checkbox, or a control with `aria-expanded`) on or off as a click
   * would; its first state is put back when the tour ends.
   */
  setSwitch: (name: string, on: boolean) => void;
}

export interface TourStep {
  /** Stable within its tour. */
  id: string;
  title: string;
  body: string;
  /** `data-tour` values; the spotlight is the union of every element carrying one. */
  targets: readonly string[];
  /** Invites the reader to use the highlighted control. */
  tryIt?: string;
  /** Sets the app up for the step; run on entering it from any direction. */
  enter?: (ctx: StepContext) => void | Promise<void>;
  /** Undoes what `enter` showed, when moving to another step of the same tour. */
  leave?: (ctx: StepContext) => void | Promise<void>;
  /** An optional side path from this step: another tour, taken from a button on the card. */
  detour?: { tour: TourId; label: string };
}

export interface Tour {
  id: TourId;
  title: string;
  blurb: string;
  /** The page the tour runs on, given the page in force. */
  pageFor: (current: Page) => Page;
  steps: readonly TourStep[];
  /** Reached from another tour's step; optional, so it never keeps the Help button lit. */
  sidePath?: boolean;
}

export interface TourRecord {
  /** The step reached, from 0. */
  step: number;
  /** Whether the reader has walked it to the end, and not restarted it since. */
  done: boolean;
  at: string;
}

export interface TourProgressDocument {
  offerDismissed: boolean;
  /** The tour left most recently. */
  last: TourId | null;
  tours: Partial<Record<TourId, TourRecord>>;
  /** The ids of the steps the reader has been shown, per tour; a step added later is unseen. */
  seen: Partial<Record<TourId, string[]>>;
}

export const TOUR_KEY = "tectonic.tour";
const TOUR_IDS: readonly TourId[] = ["orientation", "map", "earthquakes", "mechanism"];

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const isTourId = (v: unknown): v is TourId => TOUR_IDS.some((id) => id === v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function parseRecord(v: unknown): TourRecord | null {
  if (!isRecord(v)) return null;
  const { step, done, at } = v;
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0) return null;
  if (typeof done !== "boolean" || typeof at !== "string") return null;
  return { step, done, at };
}

/** Reads a stored document; anything malformed reads as a fresh start. */
export function parseTourProgress(raw: string | null): TourProgressDocument {
  const fresh: TourProgressDocument = { offerDismissed: false, last: null, tours: {}, seen: {} };
  if (raw === null) return fresh;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return fresh;
  }
  if (!isRecord(v)) return fresh;
  const tours: Partial<Record<TourId, TourRecord>> = {};
  if (isRecord(v.tours)) {
    for (const [id, rec] of Object.entries(v.tours)) {
      const r = parseRecord(rec);
      if (isTourId(id) && r !== null) tours[id] = r;
    }
  }
  const seen: Partial<Record<TourId, string[]>> = {};
  if (isRecord(v.seen)) {
    for (const [id, ids] of Object.entries(v.seen)) {
      if (isTourId(id) && Array.isArray(ids)) {
        seen[id] = ids.filter((s): s is string => typeof s === "string");
      }
    }
  }
  return {
    offerDismissed: v.offerDismissed === true,
    last: isTourId(v.last) ? v.last : null,
    tours,
    seen,
  };
}

export interface TourProgress {
  doc: Readonly<Ref<TourProgressDocument>>;
  /** Records the step reached; `stepId`, when given, is marked as shown. */
  record: (id: TourId, step: number, done: boolean, stepId?: string) => void;
  dismissOffer: () => void;
}

export function createTourProgress(
  storage: StorageLike | null = localStorage,
  now: () => Date = () => new Date(),
): TourProgress {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(TOUR_KEY) ?? null;
  } catch {
    // storage disabled; start fresh
  }
  const doc = ref<TourProgressDocument>(parseTourProgress(raw));
  function commit(next: TourProgressDocument): void {
    doc.value = next;
    try {
      storage?.setItem(TOUR_KEY, JSON.stringify(next));
    } catch {
      // storage full or disabled; progress holds for this page
    }
  }
  return {
    doc,
    record(id, step, done, stepId) {
      const at = now().toISOString();
      const had = doc.value.seen[id] ?? [];
      const seen =
        stepId === undefined || had.includes(stepId)
          ? doc.value.seen
          : { ...doc.value.seen, [id]: [...had, stepId] };
      commit({
        ...doc.value,
        last: id,
        tours: { ...doc.value.tours, [id]: { step, done, at } },
        seen,
      });
    },
    dismissOffer() {
      if (!doc.value.offerDismissed) commit({ ...doc.value, offerDismissed: true });
    },
  };
}

/** Whether any step of the tours has not yet been shown to the reader. */
export function hasUnseen(doc: TourProgressDocument, tours: readonly Tour[]): boolean {
  return tours.some((t) => t.steps.some((s) => doc.seen[t.id]?.includes(s.id) !== true));
}

/** What a tour's entry in the Help menu says about it. */
export type TourState = { kind: "new" } | { kind: "partway"; step: number } | { kind: "done" };

export function tourState(doc: TourProgressDocument, id: TourId): TourState {
  const r = doc.tours[id];
  if (r === undefined) return { kind: "new" };
  return r.done ? { kind: "done" } : { kind: "partway", step: r.step };
}

export interface ActiveTour {
  tour: Tour;
  index: number;
  step: TourStep;
  /** The tour a side path was taken from, which its end returns to; null on a main tour. */
  parent: Tour | null;
}

export interface TourRunner {
  tours: readonly Tour[];
  progress: TourProgress;
  active: ComputedRef<ActiveTour | null>;
  /** The tour left unfinished most recently, with the step to resume at. */
  resumable: ComputedRef<{ tour: Tour; step: number } | null>;
  /** True while some step of the tours is yet to be shown; the Help button stands out until then. */
  unseen: ComputedRef<boolean>;
  start: (id: TourId, step?: number) => Promise<void>;
  next: () => Promise<void>;
  back: () => Promise<void>;
  goTo: (index: number) => Promise<void>;
  /** Takes the step's side path; its last step, or Back from its first, returns here. */
  detour: () => Promise<void>;
  /** Leaves the tour where it stands, saving the step, and gives the reader's view back. */
  exit: () => Promise<void>;
  /** `MapShell` hands its map over while mounted. */
  attachMap: (mv: MapView) => void;
  detachMap: (mv: MapView) => void;
}

/** How long a first visit settles before the tour is offered. */
export const OFFER_DELAY_MS = 1200;
/** How long a step waits for a map to appear after a page switch. */
export const MAP_WAIT_MS = 3000;

/** Records a map's reader-set state, its zoom included; the function returned puts it back. */
export function mapSnapshot(mv: MapView): () => void {
  const plates = mv.showPlates.value;
  const teeth = mv.showTeeth.value;
  const aurora = mv.showAurora.value;
  const field = mv.field.value;
  const pinOpen = mv.pin.open.value;
  const measured = mv.measure.shown.value;
  const theater = mv.theater.value;
  const zoom = mv.transform.value;
  return () => {
    mv.section.cancel();
    mv.measure.cancel();
    mv.pin.cancel();
    mv.showPlates.value = plates;
    mv.showTeeth.value = teeth;
    mv.showAurora.value = aurora;
    mv.field.value = field;
    if (mv.pin.open.value !== pinOpen) mv.pin.toggle();
    if (mv.measure.shown.value !== measured) {
      mv.measure.clear();
      if (measured !== null) {
        mv.measure.toggle();
        mv.measure.place(measured.a);
        mv.measure.place(measured.b);
      }
    }
    if (mv.theater.value !== theater) mv.toggleTheater();
    if (mv.transform.value.toString() !== zoom.toString()) mv.setTransform(zoom);
  };
}

export function createTour(
  tours: readonly Tour[],
  progress: TourProgress,
  stage: TourStage,
  opts: { mapWaitMs?: number; switches?: Switches } = {},
): TourRunner {
  const mapWaitMs = opts.mapWaitMs ?? MAP_WAIT_MS;
  interface Frame {
    tour: Tour;
    index: number;
  }
  const current = shallowRef<(Frame & { parent: Frame | null }) | null>(null);
  const map = shallowRef<MapView | null>(null);
  let waiting: ((mv: MapView | null) => void)[] = [];
  /** Restores for the maps a tour has touched; a map that unmounted takes its state with it. */
  const restores = new Map<MapView, () => void>();
  let origin: string | null = null;
  /** Bumped on every move, so a step whose set-up is overtaken stops acting. */
  let seq = 0;

  const byId = (id: TourId): Tour | undefined => tours.find((t) => t.id === id);

  function touchedMap(): Promise<MapView | null> {
    const take = (mv: MapView | null): MapView | null => {
      if (mv !== null && !restores.has(mv)) restores.set(mv, mapSnapshot(mv));
      return mv;
    };
    if (map.value !== null) return Promise.resolve(take(map.value));
    return new Promise((resolve) => {
      const done = (mv: MapView | null): void => {
        clearTimeout(timer);
        waiting = waiting.filter((w) => w !== done);
        resolve(take(mv));
      };
      const timer = setTimeout(() => {
        done(null);
      }, mapWaitMs);
      waiting.push(done);
    });
  }
  const switches = opts.switches ?? domSwitches();
  /** Each switch a step set, as the reader had it. */
  const switched = new Map<string, boolean>();
  const ctx: StepContext = {
    ...stage,
    map: touchedMap,
    setSwitch(name, on) {
      const was = switches.get(name);
      if (was === null) return;
      if (!switched.has(name)) switched.set(name, was);
      if (was !== on) switches.set(name, on);
    },
  };

  async function enter(
    tour: Tour,
    index: number,
    from: number | null,
    parent: Frame | null,
  ): Promise<void> {
    const mine = ++seq;
    const prev = from === null ? undefined : tour.steps[from];
    current.value = { tour, index, parent };
    progress.record(tour.id, index, false, tour.steps[index]?.id);
    if (prev?.leave !== undefined && from !== index) await prev.leave(ctx);
    if (mine !== seq) return;
    const want = tour.pageFor(stage.page());
    if (want !== stage.page()) await stage.goPage(want);
    if (mine !== seq) return;
    await tour.steps[index]?.enter?.(ctx);
  }

  /** Leaves a side path for the step it was taken from, with that step set up again. */
  async function rejoin(from: Frame, parent: Frame, done: boolean): Promise<void> {
    progress.record(from.tour.id, done ? 0 : from.index, done);
    await enter(parent.tour, parent.index, null, null);
  }

  async function end(done: boolean): Promise<void> {
    const c = current.value;
    if (c === null) return;
    seq++;
    current.value = null;
    progress.record(c.tour.id, done ? 0 : c.index, done);
    for (const restore of restores.values()) restore();
    restores.clear();
    for (const [name, was] of switched) {
      if (switches.get(name) === !was) switches.set(name, was);
    }
    switched.clear();
    const back = origin;
    origin = null;
    if (back !== null && back !== stage.location()) await stage.restore(back);
  }

  return {
    tours,
    progress,
    active: computed(() => {
      const c = current.value;
      const step = c?.tour.steps[c.index];
      if (c === null || step === undefined) return null;
      return { tour: c.tour, index: c.index, step, parent: c.parent?.tour ?? null };
    }),
    unseen: computed(() =>
      hasUnseen(
        progress.doc.value,
        tours.filter((t) => t.sidePath !== true),
      ),
    ),
    resumable: computed(() => {
      const last = progress.doc.value.last;
      if (last === null) return null;
      const tour = byId(last);
      const r = progress.doc.value.tours[last];
      if (tour === undefined || r === undefined || r.done) return null;
      return { tour, step: Math.min(r.step, tour.steps.length - 1) };
    }),
    async start(id, step = 0) {
      const tour = byId(id);
      if (tour === undefined) return;
      progress.dismissOffer();
      const was = current.value;
      if (was !== null && was.tour.id !== id) await end(false);
      origin ??= stage.location();
      const index = Math.max(0, Math.min(step, tour.steps.length - 1));
      await enter(tour, index, was?.tour.id === id ? was.index : null, null);
    },
    async next() {
      const c = current.value;
      if (c === null) return;
      if (c.index < c.tour.steps.length - 1) await enter(c.tour, c.index + 1, c.index, c.parent);
      else if (c.parent !== null) await rejoin(c, c.parent, true);
      else await end(true);
    },
    async back() {
      const c = current.value;
      if (c === null) return;
      if (c.index > 0) await enter(c.tour, c.index - 1, c.index, c.parent);
      else if (c.parent !== null) await rejoin(c, c.parent, false);
    },
    async goTo(index) {
      const c = current.value;
      if (c === null || index < 0 || index >= c.tour.steps.length) return;
      await enter(c.tour, index, c.index, c.parent);
    },
    async detour() {
      const c = current.value;
      const to = c?.tour.steps[c.index]?.detour;
      const side = to === undefined ? undefined : byId(to.tour);
      if (c === null || side === undefined) return;
      await enter(side, 0, null, { tour: c.tour, index: c.index });
    },
    exit: () => end(false),
    attachMap(mv) {
      map.value = mv;
      const w = waiting;
      waiting = [];
      for (const done of w) done(mv);
    },
    detachMap(mv) {
      if (map.value === mv) map.value = null;
      restores.delete(mv);
    },
  };
}

export const TOUR: InjectionKey<TourRunner> = Symbol("tour");
export const TOUR_PROGRESS: InjectionKey<TourProgress> = Symbol("tourProgress");
