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
