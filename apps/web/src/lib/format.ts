/** Which zone dates and times are presented in: UTC or the browser's. */
export type Zone = "utc" | "local";

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

const two = (n: number): string => String(n).padStart(2, "0");

function partsOf(d: Date, zone: Zone): Parts {
  return zone === "utc"
    ? {
        year: String(d.getUTCFullYear()),
        month: two(d.getUTCMonth() + 1),
        day: two(d.getUTCDate()),
        hour: two(d.getUTCHours()),
        minute: two(d.getUTCMinutes()),
        second: two(d.getUTCSeconds()),
      }
    : {
        year: String(d.getFullYear()),
        month: two(d.getMonth() + 1),
        day: two(d.getDate()),
        hour: two(d.getHours()),
        minute: two(d.getMinutes()),
        second: two(d.getSeconds()),
      };
}

/** "UTC", or the browser zone's abbreviation at that instant, e.g. "PDT". */
export function zoneLabel(zone: Zone, d: Date): string {
  if (zone === "utc") return "UTC";
  return new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
    .formatToParts(d)
    .filter((p) => p.type === "timeZoneName")
    .map((p) => p.value)
    .join("");
}

export interface StampOptions {
  seconds?: boolean;
  /** "full" is YYYY-MM-DD (default); "monthday" is MM-DD. */
  date?: "full" | "monthday";
  /** Append the zone label (default true). */
  label?: boolean;
}

/** "2026-10-13 12:23 UTC" by default. */
export function fmtStamp(iso: string, zone: Zone, opts: StampOptions = {}): string {
  const d = new Date(iso);
  const p = partsOf(d, zone);
  const date = opts.date === "monthday" ? `${p.month}-${p.day}` : `${p.year}-${p.month}-${p.day}`;
  const time =
    opts.seconds === true ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`;
  const label = opts.label === false ? "" : ` ${zoneLabel(zone, d)}`;
  return `${date} ${time}${label}`;
}

/** "Oct 13, 12:23 UTC" for tooltips. */
export function fmtShort(iso: string, zone: Zone): string {
  const d = new Date(iso);
  const p = partsOf(d, zone);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    ...(zone === "utc" ? { timeZone: "UTC" } : {}),
  }).format(d);
  return `${month} ${String(Number(p.day))}, ${p.hour}:${p.minute} ${zoneLabel(zone, d)}`;
}

/** "12:23 UTC". */
export function fmtClock(iso: string, zone: Zone): string {
  const d = new Date(iso);
  const p = partsOf(d, zone);
  return `${p.hour}:${p.minute} ${zoneLabel(zone, d)}`;
}

/** The calendar date, YYYY-MM-DD, of an instant in a zone. */
export function dateIn(iso: string, zone: Zone): string {
  const p = partsOf(new Date(iso), zone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function ago(iso: string, now: Date): string {
  const h = (now.getTime() - Date.parse(iso)) / 36e5;
  if (h < 1) return `${String(Math.max(1, Math.round(h * 60)))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export function fmtMag(mag: number | null, precise = false): string {
  if (mag === null) return "—";
  if (!precise) return mag.toFixed(1);
  const s = mag.toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
}

export function fmtMoment(v: number | null): { mantissa: string; exponent: number } | null {
  if (v === null) return null;
  const exponent = Math.floor(Math.log10(v));
  return { mantissa: (v / 10 ** exponent).toFixed(2), exponent };
}

export function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns}, ${Math.abs(lon).toFixed(3)}°${ew}`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

/** The USGS place string, or a stand-in when the network published none. */
export function placeOf(e: { place: string | null }): string {
  return e.place ?? "unknown location";
}
