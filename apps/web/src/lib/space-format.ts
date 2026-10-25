import type { Zone } from "./format.js";

/**
 * Vocabulary for the Space page: GOES flare classes from a flux, NOAA G levels from Kp, Kp in
 * thirds, alert titles from the NWS message text, and the `datetime-local` input form.
 */

/** GOES class letter and number for a 0.1–0.8 nm flux in W/m²: `C4.2`, `X12.3`; an em dash when unusable. */
export function xrayClass(flux: number | null): string {
  if (flux === null || !Number.isFinite(flux) || flux <= 0) return "—";
  const classes: [string, number][] = [
    ["X", 1e-4],
    ["M", 1e-5],
    ["C", 1e-6],
    ["B", 1e-7],
  ];
  for (const [letter, base] of classes) {
    if (flux >= base) return `${letter}${(flux / base).toFixed(1)}`;
  }
  return `A${(flux / 1e-8).toFixed(1)}`;
}

/** NOAA G level for a Kp value: Kp 5 (from 5-) is G1 … Kp 9 is G5. */
export function gLevel(kp: number): number {
  // G4 reaches up through 9- (8.67); only a full 9 is G5.
  if (kp >= 8.9) return 5;
  const k = Math.round(kp);
  if (k >= 8) return 4;
  if (k >= 7) return 3;
  if (k >= 6) return 2;
  if (k >= 5) return 1;
  return 0;
}

/** Kp in the thirds notation SWPC uses: 4.67 is `5-`, 4 is `4`, 4.33 is `4+`. */
export function fmtKp(kp: number): string {
  const thirds = Math.round(kp * 3);
  const base = Math.round(thirds / 3);
  const diff = thirds - base * 3;
  if (diff < 0) return `${String(base)}-`;
  if (diff > 0) return `${String(base)}+`;
  return String(base);
}

/** A CSS class for a NOAA scale level, `lv0` to `lv5`; unknown levels are `lv0`. */
export const scaleClass = (level: number | null): string =>
  level === null || level < 0 ? "lv0" : `lv${String(Math.min(5, Math.floor(level)))}`;

/**
 * The headline of a SWPC message: the first line after the header block (message code, serial
 * number, issue time, blank line), e.g. `WARNING: Geomagnetic K-index of 5 expected`. A message
 * without that shape yields its first non-empty line.
 */
export function alertTitle(message: string): string {
  const lines = message.split(/\r?\n/).map((l) => l.trim());
  const blank = lines.indexOf("");
  const after = blank < 0 ? [] : lines.slice(blank + 1);
  const headline = after.find((l) => l !== "") ?? lines.find((l) => l !== "");
  return headline ?? "";
}

const two = (n: number): string => String(n).padStart(2, "0");

/** The `YYYY-MM-DDTHH:mm` a `datetime-local` input shows for an instant in a zone. */
export function toInputValue(d: Date, zone: Zone): string {
  return zone === "utc"
    ? `${String(d.getUTCFullYear())}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}T${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
    : `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The instant a `datetime-local` value names in a zone, or null when it is not one. */
export function fromInputValue(text: string, zone: Zone): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (m === null) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  // The pattern guarantees digits, so the parts are finite and the instant always exists.
  return zone === "utc"
    ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)))
    : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

/** Minutes between two instants, rounded. */
export const minutesBetween = (a: Date, b: Date): number =>
  Math.round(Math.abs(b.getTime() - a.getTime()) / 60_000);

/** A compact value for a tile: up to `digits` decimals, trailing zeros dropped. */
export function fmtValue(v: number, digits = 1): string {
  return String(Number(v.toFixed(digits)));
}
