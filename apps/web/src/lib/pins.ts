import { ref, type Ref } from "vue";

/**
 * The reader's map pins: at most one per map view (Global, West Coast), kept
 * in localStorage with a history of the most recent placements. Moving or
 * renaming a pin updates its history entry; removing it keeps the entry.
 */

/** The map views a pin belongs to: the same split as the field rasters. */
export type PinView = "global" | "wc";
export const PIN_VIEWS: readonly PinView[] = ["global", "wc"];
export const PIN_VIEW_LABELS: Record<PinView, string> = { global: "Global", wc: "West Coast" };

export interface Pin {
  id: string;
  view: PinView;
  lon: number;
  lat: number;
  /** The reader's name for it; empty when unnamed. */
  name: string;
  /** When it was placed, ISO 8601. */
  placed: string;
}

export interface PinsDocument {
  current: Record<PinView, Pin | null>;
  /** Newest first, at most `PIN_HISTORY`. */
  history: Pin[];
}

export const PINS_KEY = "tectonic.pins";
export const PIN_HISTORY = 24;
export const PIN_NAME_MAX = 80;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isView = (v: unknown): v is PinView => v === "global" || v === "wc";
const inRange = (v: unknown, lim: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;

/** One stored pin, or null when any field is missing or malformed. */
export function parsePin(v: unknown): Pin | null {
  if (!isRecord(v)) return null;
  const { id, view, lon, lat, name, placed } = v;
  if (typeof id !== "string" || id === "" || !isView(view)) return null;
  if (!inRange(lon, 180) || !inRange(lat, 90)) return null;
  if (typeof name !== "string" || typeof placed !== "string") return null;
  if (Number.isNaN(Date.parse(placed))) return null;
  return { id, view, lon, lat, name: name.slice(0, PIN_NAME_MAX), placed };
}

const emptyDocument = (): PinsDocument => ({ current: { global: null, wc: null }, history: [] });

/** The pins from their stored JSON; a malformed pin is dropped and the rest kept. */
export function parsePins(raw: string | null): PinsDocument {
  const doc = emptyDocument();
  let parsed: unknown = null;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!isRecord(parsed)) return doc;
  const current = isRecord(parsed.current) ? parsed.current : {};
  for (const view of PIN_VIEWS) {
    const p = parsePin(current[view]);
    doc.current[view] = p !== null && p.view === view ? p : null;
  }
  const history = Array.isArray(parsed.history) ? parsed.history : [];
  doc.history = history
    .map(parsePin)
    .filter((p): p is Pin => p !== null)
    .slice(0, PIN_HISTORY);
  return doc;
}

/** "37.7749, −122.4194": latitude then longitude in signed decimal degrees, four places. */
export function fmtLatLon(lon: number, lat: number): string {
  const f = (v: number): string => v.toFixed(4).replace("-", "−");
  return `${f(lat)}, ${f(lon)}`;
}

/** What the pin's hover says: its name, if any, over its coordinates. */
export function pinTitle(p: Pin): string {
  const where = fmtLatLon(p.lon, p.lat);
  return p.name === "" ? where : `${p.name} · ${where}`;
}

export interface PinsStore {
  /** The pins and history; replaced on every change. */
  doc: Readonly<Ref<PinsDocument>>;
  /** Drops a new pin in a view, replacing any there, and records it at the head of the history. */
  place(view: PinView, lonLat: [number, number]): Pin;
  move(view: PinView, lonLat: [number, number]): void;
  rename(view: PinView, name: string): void;
  /** Takes the view's pin off the map; its history entry stays. */
  remove(view: PinView): void;
}

function readRaw(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(PINS_KEY) ?? null;
  } catch {
    return null;
  }
}

let seq = 0;
const newId = (now: Date): string => `${now.getTime().toString(36)}-${(seq++).toString(36)}`;

export function createPins(
  storage: StorageLike | null = localStorage,
  now: () => Date = () => new Date(),
): PinsStore {
  const doc = ref<PinsDocument>(parsePins(readRaw(storage)));
  function commit(next: PinsDocument): void {
    doc.value = next;
    try {
      storage?.setItem(PINS_KEY, JSON.stringify(next));
    } catch {
      // storage full or disabled; the pin still shows for this page
    }
  }
  /** Applies a change to the view's pin and to its history entry. */
  function update(view: PinView, change: Partial<Pick<Pin, "lon" | "lat" | "name">>): void {
    const pin = doc.value.current[view];
    if (pin === null) return;
    const next = { ...pin, ...change };
    commit({
      current: { ...doc.value.current, [view]: next },
      history: doc.value.history.map((h) => (h.id === pin.id ? next : h)),
    });
  }
  return {
    doc,
    place(view, [lon, lat]) {
      const at = now();
      const pin: Pin = { id: newId(at), view, lon, lat, name: "", placed: at.toISOString() };
      commit({
        current: { ...doc.value.current, [view]: pin },
        history: [pin, ...doc.value.history].slice(0, PIN_HISTORY),
      });
      return pin;
    },
    move(view, [lon, lat]) {
      update(view, { lon, lat });
    },
    rename(view, name) {
      update(view, { name: name.trim().slice(0, PIN_NAME_MAX) });
    },
    remove(view) {
      if (doc.value.current[view] === null) return;
      commit({ ...doc.value, current: { ...doc.value.current, [view]: null } });
    },
  };
}
