import { ref, type Ref } from "vue";

export interface Settings {
  /** Rows of major-event and volcano cards shown before "… N more": alone on a page, or with the other dataset. */
  cardRows: { alone: number; combined: number };
}

export const DEFAULT_SETTINGS: Settings = { cardRows: { alone: 3, combined: 1 } };
export const SETTINGS_KEY = "tectonic.settings";
const MAX_ROWS = 20;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const rowsOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_ROWS ? v : fallback;

/** Settings from their stored JSON; each field falls back on its own when missing or malformed. */
export function parseSettings(raw: string | null): Settings {
  let parsed: unknown = null;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const root = isRecord(parsed) ? parsed : {};
  const cr = isRecord(root.cardRows) ? root.cardRows : {};
  return {
    cardRows: {
      alone: rowsOr(cr.alone, DEFAULT_SETTINGS.cardRows.alone),
      combined: rowsOr(cr.combined, DEFAULT_SETTINGS.cardRows.combined),
    },
  };
}

export interface SettingsStore {
  current: Readonly<Ref<Settings>>;
  set(next: Settings): void;
}

function readRaw(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Reader-tunable settings, persisted in localStorage; no editor yet. */
export function createSettings(storage: StorageLike | null = localStorage): SettingsStore {
  const current = ref<Settings>(parseSettings(readRaw(storage)));
  return {
    current,
    set(next) {
      current.value = next;
      try {
        storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // storage full or disabled; the change still applies for this page
      }
    },
  };
}
