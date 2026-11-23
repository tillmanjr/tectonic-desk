import type { SunKey } from "@tectonic/shared";
import { fmtStamp, type Zone } from "./format.js";
import { windowLabel, type SpaceRange } from "./space.js";

/**
 * The agencies' ready-made "latest" movies behind the Sun overlay's animation, played straight
 * from their servers (the site's CSP allows their media). Each comes in 512 px (2.5 to 10 MB,
 * the default) and 1024 px (11 to 75 MB, on request). SDO's cover the last 48 hours, SOHO's
 * LASCO movies about four days: a fixed recent span, not the page's window.
 */

export type MovieSize = 512 | 1024;

export interface SunMovie {
  src: Record<MovieSize, string>;
  /** The span the movie covers, ending about now. */
  hours: number;
  /** The span in words, for the caption. */
  span: string;
}

const SDO = "https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_";
const SOHO = "https://soho.nascom.nasa.gov/data/LATEST/current_";
const sdo = (channel: string): SunMovie => ({
  src: { 512: `${SDO}512_${channel}.mp4`, 1024: `${SDO}1024_${channel}.mp4` },
  hours: 48,
  span: "the last 48 hours",
});
const lasco = (camera: string): SunMovie => ({
  src: { 512: `${SOHO}${camera}small.mp4`, 1024: `${SOHO}${camera}.mp4` },
  hours: 96,
  span: "about the last 4 days",
});

export const SUN_MOVIES: Record<SunKey, SunMovie> = {
  aia193: sdo("0193"),
  aia304: sdo("0304"),
  aia171: sdo("0171"),
  hmii: sdo("HMIIC"),
  hmib: sdo("HMIB"),
  c2: lasco("c2"),
  c3: lasco("c3"),
};

/** The page's window in words: a preset's label, or a fixed range's ends. */
function windowText(range: SpaceRange, zone: Zone): string {
  if (range.kind === "window") return windowLabel(range.id).toLowerCase();
  const from = fmtStamp(range.from.toISOString(), zone, { label: false });
  return `${from} to ${fmtStamp(range.to.toISOString(), zone)}`;
}

/**
 * What the animation covers against the page. No window preset ends where a movie's span does
 * (48 hours, about 4 days), so the caption always names both.
 */
export function movieNote(movie: SunMovie, range: SpaceRange, zone: Zone): string {
  return `Showing ${movie.span} only; the page shows ${windowText(range, zone)}.`;
}
