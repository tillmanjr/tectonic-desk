/**
 * The latest pictures of the Sun the Space page shows: five SDO channels and the two SOHO LASCO
 * coronagraphs, in the order the strip draws them. The server proxies and caches the frames;
 * the web reads this list for the titles, notes and credits.
 */

export type SunSource = "sdo" | "soho";

export interface SunFrameSpec {
  key: string;
  title: string;
  /** One line for the reader: what the channel shows. */
  note: string;
  source: SunSource;
}

export const SUN_FRAMES = [
  {
    key: "aia193",
    title: "AIA 193 Å",
    note: "Corona at 1.2 MK; coronal holes dark, active regions bright",
    source: "sdo",
  },
  {
    key: "aia304",
    title: "AIA 304 Å",
    note: "Chromosphere and transition region, 50 000 K; prominences and filaments",
    source: "sdo",
  },
  {
    key: "aia171",
    title: "AIA 171 Å",
    note: "Quiet corona and coronal loops, 0.6 MK",
    source: "sdo",
  },
  { key: "hmii", title: "HMI intensitygram", note: "Visible light; sunspots", source: "sdo" },
  {
    key: "hmib",
    title: "HMI magnetogram",
    note: "Line-of-sight field; white toward us, black away",
    source: "sdo",
  },
  {
    key: "c2",
    title: "LASCO C2",
    note: "Corona from 1.5 to 6 solar radii, the disk occulted; CMEs leave here",
    source: "soho",
  },
  { key: "c3", title: "LASCO C3", note: "Corona from 3.7 to 30 solar radii", source: "soho" },
] as const satisfies readonly SunFrameSpec[];

export type SunKey = (typeof SUN_FRAMES)[number]["key"];
export type SunFrame = (typeof SUN_FRAMES)[number];

/** The two sizes proxied: the strip's thumbnails and the overlay's large frame. */
export const SUN_SIZES = [512, 1024] as const;
export type SunSize = (typeof SUN_SIZES)[number];

export const isSunKey = (s: string): s is SunKey => SUN_FRAMES.some((f) => f.key === s);
export const isSunSize = (n: number): n is SunSize => SUN_SIZES.some((s) => s === n);

/** The credit line each agency asks for. */
export const SUN_CREDIT: Record<SunSource, string> = {
  sdo: "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams",
  soho: "SOHO (ESA & NASA)",
};

export function sunFrame(key: SunKey): SunFrame {
  const found = SUN_FRAMES.find((f) => f.key === key);
  if (found === undefined) throw new Error(`unknown sun frame ${key}`);
  return found;
}

/** What the server knows of a frame beyond its bytes: the upstream time, when given, and the size. */
export interface SunFrameMeta {
  key: SunKey;
  time: Date | null;
  bytes: number;
}

/**
 * Generated animations: a Helioviewer movie of one channel over a window the reader chose,
 * when the agencies' latest movies do not cover it. At most `SUN_MOVIE_MAX_MS` long; a longer
 * window is cut to its last 30 days.
 */
export const SUN_MOVIE_MAX_MS = 30 * 86_400_000;
export const SUN_MOVIE_SIZES = [512, 1024] as const;
export type SunMovieSize = (typeof SUN_MOVIE_SIZES)[number];
export const isSunMovieSize = (n: number): n is SunMovieSize =>
  SUN_MOVIE_SIZES.some((s) => s === n);

/** The first image Helioviewer holds for each channel; a generated movie cannot start earlier. */
export const SUN_ARCHIVE_START: Record<SunKey, string> = {
  aia193: "2010-06-02T00:00:00Z",
  aia304: "2010-06-02T00:00:00Z",
  aia171: "2010-06-02T00:00:00Z",
  hmii: "2010-12-06T00:00:00Z",
  hmib: "2010-12-06T00:00:00Z",
  c2: "1997-02-21T00:00:00Z",
  c3: "1997-02-21T00:00:00Z",
};

/** Credit for a generated movie, beside the agency's own. */
export const HELIOVIEWER_CREDIT = "Movie built by Helioviewer.org";

export type GeneratedMovieState = "building" | "ready";

/** A generated movie: where its build stands, and its address once ready. */
export interface GeneratedMovie {
  key: SunKey;
  size: SunMovieSize;
  /** The span asked for, after the server rounded it to whole hours. */
  from: Date;
  to: Date;
  state: GeneratedMovieState;
  /** Percent done while building, when Helioviewer says; null otherwise. */
  progress: number | null;
  /** The movie's URL once ready. */
  url: string | null;
}
