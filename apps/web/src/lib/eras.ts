/**
 * A change in the earthquake record itself, drawn on the time chart so a
 * step in the counts reads as detection, not seismicity.
 */
export interface Era {
  year: number;
  label: string;
  note: string;
}

export const ERAS: readonly Era[] = [
  {
    year: 1964,
    label: "WWSSN",
    note: "WWSSN network and ISC founded; global record complete to about M5.5–6",
  },
  { year: 1973, label: "PDE", note: "NEIC PDE enters ComCat; complete to about M4.5" },
  {
    year: 1976,
    label: "GCMT",
    note: "Global CMT begins; Mw measured rather than proxied above about M5",
  },
];

export function eraStart(era: Era): Date {
  return new Date(Date.UTC(era.year, 0, 1));
}

/** The eras whose first instant lies in `[from, to]`. */
export function erasWithin(from: Date, to: Date): Era[] {
  return ERAS.filter((e) => {
    const t = eraStart(e).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
}

/** A mark on the chart: the era and the x of its first instant, in viewBox units. */
export interface EraMark {
  era: Era;
  x: number;
}

/** The mark with the row its label sits on: 0 is the top row, each row below the last. */
export interface EraLabel extends EraMark {
  tier: number;
}

/** The label is set 3 units right of its mark in a 10 px data font, about 6.2 units a character. */
const LABEL_OFFSET = 3;
const CHAR_W = 6.2;
/** Clear space wanted between a label's end and the next mark on the same row. */
const LABEL_GAP = 4;

/**
 * Places each label on the highest row where the previous label on that row has ended before
 * the mark, so labels of marks that crowd together at a wide window step down instead of
 * overprinting. Marks come in ascending x.
 */
export function eraLabels(marks: readonly EraMark[]): EraLabel[] {
  const ends: number[] = [];
  return marks.map((m) => {
    const free = ends.findIndex((end) => end + LABEL_GAP <= m.x);
    const tier = free === -1 ? ends.length : free;
    ends[tier] = m.x + LABEL_OFFSET + m.era.label.length * CHAR_W;
    return { ...m, tier };
  });
}
