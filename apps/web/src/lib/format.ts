export function fmtUtc(iso: string, seconds = false): string {
  return new Date(iso)
    .toISOString()
    .slice(0, seconds ? 19 : 16)
    .replace("T", " ");
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** "Oct 13, 12:23 UTC": month, day, hour and minute, for tooltips. */
export function fmtUtcShort(iso: string): string {
  const d = new Date(iso);
  return `${MONTH.format(d)} ${String(d.getUTCDate())}, ${d.toISOString().slice(11, 16)} UTC`;
}

export function fmtUtcTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

export function fmtLocal(iso: string, timeZone?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  if (timeZone !== undefined) opts.timeZone = timeZone;
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
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
