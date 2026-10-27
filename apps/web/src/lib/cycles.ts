import type { EraMark } from "./eras.js";

/**
 * The solar cycles the long record spans, by their smoothed-sunspot minima and maxima as SILSO
 * lists them (https://www.sidc.be/SILSO/cyclesmm). A long window marks each minimum on the axis
 * the way the earthquake chart marks changes in its catalogue.
 */
export interface SolarCycle {
  number: number;
  /** The month of minimum that opens the cycle. */
  minimum: Date;
  /** The month of maximum, or null while the cycle is still rising. */
  maximum: Date | null;
}

const month = (year: number, m: number): Date => new Date(Date.UTC(year, m - 1, 1));

export const CYCLES: readonly SolarCycle[] = [
  { number: 17, minimum: month(1933, 9), maximum: month(1937, 4) },
  { number: 18, minimum: month(1944, 2), maximum: month(1947, 5) },
  { number: 19, minimum: month(1954, 4), maximum: month(1958, 3) },
  { number: 20, minimum: month(1964, 10), maximum: month(1968, 11) },
  { number: 21, minimum: month(1976, 3), maximum: month(1979, 12) },
  { number: 22, minimum: month(1986, 9), maximum: month(1989, 11) },
  { number: 23, minimum: month(1996, 8), maximum: month(2001, 11) },
  { number: 24, minimum: month(2008, 12), maximum: month(2014, 4) },
  { number: 25, minimum: month(2019, 12), maximum: null },
];

/** Windows up to this long are too short for the marks to mean anything. */
export const CYCLE_MARK_MIN_MS = 2 * 365.25 * 86_400_000;

const MONTH_YEAR = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Minimum Dec 2008, maximum Apr 2014"; a rising cycle names only its minimum. */
export function cycleNote(c: SolarCycle): string {
  const min = `Minimum ${MONTH_YEAR.format(c.minimum)}`;
  return c.maximum === null ? min : `${min}, maximum ${MONTH_YEAR.format(c.maximum)}`;
}

/** The cycles whose minimum lies in `[from, to]`. */
export function cyclesWithin(from: Date, to: Date): SolarCycle[] {
  return CYCLES.filter((c) => c.minimum >= from && c.minimum <= to);
}

/**
 * Marks for a window longer than `CYCLE_MARK_MIN_MS`, in the shape `eraLabels` tiers: the
 * label is the cycle number, the note its minimum and maximum, the year that of the minimum.
 */
export function cycleMarks(from: Date, to: Date, x: (d: Date) => number): EraMark[] {
  if (to.getTime() - from.getTime() <= CYCLE_MARK_MIN_MS) return [];
  return cyclesWithin(from, to).map((c) => ({
    era: {
      year: c.minimum.getUTCFullYear(),
      label: `Cycle ${String(c.number)}`,
      note: cycleNote(c),
    },
    x: x(c.minimum),
  }));
}
