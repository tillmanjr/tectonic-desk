/**
 * USGS ShakeMap intensity for one event: the preferred ShakeMap product's gridded Modified
 * Mercalli Intensity (the "medium resolution" coverage), which the web contours into bands.
 */

/** A regular lon/lat grid of MMI, row-major from the south-west corner. */
export interface ShakeGrid {
  /** Longitude and latitude of the first (south-west) node, degrees. */
  lon0: number;
  lat0: number;
  /** Node spacing, degrees, both positive. */
  dLon: number;
  dLat: number;
  nx: number;
  ny: number;
  /** `nx * ny` intensities, rows south to north; null where ShakeMap computed none. */
  mmi: (number | null)[];
}

export interface ShakeMap {
  eventId: string;
  /** The contributing network that made the product, e.g. "us" or "nc". */
  source: string;
  version: number | null;
  /** "automatic" until a seismologist reviews it, then "reviewed". */
  mapStatus: string | null;
  /** When ShakeMap ran. */
  processed: Date | null;
  /** The product's own maximum intensity, when it states one. */
  maxMmi: number | null;
  /** The event's epicentre from the same detail document, for distances on the map. */
  epicentre: { longitude: number; latitude: number } | null;
  grid: ShakeGrid;
}

export interface MmiLevel {
  /** The band's lower bound: intensity `mmi` covers [mmi − 0.5, mmi + 0.5). */
  mmi: number;
  roman: string;
  shaking: string;
  damage: string;
  /** USGS's ShakeMap colour for the level. */
  color: string;
}

/** The ShakeMap legend's levels, with USGS's colours and wording. */
export const MMI_SCALE: readonly MmiLevel[] = [
  { mmi: 1, roman: "I", shaking: "Not felt", damage: "None", color: "#ffffff" },
  { mmi: 2, roman: "II", shaking: "Weak", damage: "None", color: "#bfccff" },
  { mmi: 3, roman: "III", shaking: "Weak", damage: "None", color: "#a0e6ff" },
  { mmi: 4, roman: "IV", shaking: "Light", damage: "None", color: "#80ffff" },
  { mmi: 5, roman: "V", shaking: "Moderate", damage: "Very light", color: "#7aff93" },
  { mmi: 6, roman: "VI", shaking: "Strong", damage: "Light", color: "#ffff00" },
  { mmi: 7, roman: "VII", shaking: "Very strong", damage: "Moderate", color: "#ffc800" },
  { mmi: 8, roman: "VIII", shaking: "Severe", damage: "Moderate/heavy", color: "#ff9100" },
  { mmi: 9, roman: "IX", shaking: "Violent", damage: "Heavy", color: "#ff0000" },
  { mmi: 10, roman: "X+", shaking: "Extreme", damage: "Very heavy", color: "#c80000" },
];

/** The level an intensity falls in, by rounding; null outside the scale. */
export function mmiLevel(mmi: number): MmiLevel | null {
  const i = Math.min(10, Math.round(mmi));
  return MMI_SCALE.find((l) => l.mmi === i) ?? null;
}
