import { ref, type Ref } from "vue";
import { dayStart } from "./filters.js";
import { dateIn, type Zone } from "./format.js";

export const DAY_MS = 864e5;

export type StepUnit = "day" | "month" | "year";
export const UNIT_MS: Record<StepUnit, number> = {
  day: DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
};

/** Day steps up to 120 days, month steps up to 15 years, year steps beyond. */
export function unitFor(start: Date, end: Date): StepUnit {
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  return days <= 120 ? "day" : days <= 15 * 365.25 ? "month" : "year";
}

/**
 * A tracking clock over the loaded window. The map shows only events whose
 * origin time is at or before `cursor` while the animation is open.
 */
export interface Animation {
  active: Ref<boolean>;
  playing: Ref<boolean>;
  /** What one step is: a day, a 30-day month or a 365-day year, from the window length. */
  unit: Ref<StepUnit>;
  /** Playback speed: real seconds per animated unit. */
  secondsPerUnit: Ref<number>;
  cursor: Ref<Date | null>;
  start: Ref<Date | null>;
  end: Ref<Date | null>;
  /** Opens at 00:00 of the day before the window's first day, in the zone, paused. */
  open(windowStart: Date, windowEnd: Date, zone: Zone): void;
  play(): void;
  pause(): void;
  /** Moves the cursor as `ms` of real time would at the current speed; no-op while closed. */
  advance(ms: number): void;
  /** Moves the cursor a whole unit, clamped to the window, and pauses. */
  step(delta: 1 | -1): void;
  close(): void;
}

export function createAnimation(tickMs = 100): Animation {
  const active = ref(false);
  const playing = ref(false);
  const unit = ref<StepUnit>("day");
  const secondsPerUnit = ref(2);
  const cursor = ref<Date | null>(null);
  const start = ref<Date | null>(null);
  const end = ref<Date | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  function pause(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    playing.value = false;
  }

  function bounds(): { s: Date; e: Date; c: Date } | null {
    const s = start.value;
    const e = end.value;
    const c = cursor.value;
    return s === null || e === null || c === null ? null : { s, e, c };
  }

  function advance(ms: number): void {
    const b = bounds();
    if (b === null) return;
    const speed = Math.max(0.1, secondsPerUnit.value);
    const next = b.c.getTime() + (ms / 1000 / speed) * UNIT_MS[unit.value];
    if (next >= b.e.getTime()) {
      cursor.value = b.e;
      pause();
      return;
    }
    cursor.value = new Date(next);
  }

  return {
    active,
    playing,
    unit,
    secondsPerUnit,
    cursor,
    start,
    end,
    open(windowStart, windowEnd, zone) {
      pause();
      unit.value = unitFor(windowStart, windowEnd);
      const firstDay = dayStart(dateIn(windowStart.toISOString(), zone), zone);
      start.value = new Date(firstDay.getTime() - DAY_MS);
      end.value = windowEnd;
      cursor.value = start.value;
      active.value = true;
    },
    play() {
      const b = bounds();
      if (b === null || timer !== null) return;
      if (b.c.getTime() >= b.e.getTime()) cursor.value = b.s;
      playing.value = true;
      timer = setInterval(() => {
        advance(tickMs);
      }, tickMs);
    },
    pause,
    advance,
    step(delta) {
      const b = bounds();
      if (b === null) return;
      pause();
      const span = delta * UNIT_MS[unit.value];
      const t = Math.min(b.e.getTime(), Math.max(b.s.getTime(), b.c.getTime() + span));
      cursor.value = new Date(t);
    },
    close() {
      pause();
      active.value = false;
      cursor.value = null;
      start.value = null;
      end.value = null;
    },
  };
}
