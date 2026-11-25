import { ref, type Ref } from "vue";

export interface Settings {
  /** Rows of major-event and volcano cards shown before "… N more": alone on a page, or with the other dataset. */
  cardRows: { alone: number; combined: number };
  /** Whether the parts of the desk carry their ◆ deep-dive marks. */
  diveMarks: boolean;
  /** How the event panel draws its beachball: the flat equal-area plot, or as the inside of a bowl. */
  beachball: BeachballView;
}

export type BeachballView = "flat" | "bowl";

export const DEFAULT_SETTINGS: Settings = {
  cardRows: { alone: 3, combined: 1 },
  diveMarks: true,
  beachball: "flat",
};
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
    diveMarks: typeof root.diveMarks === "boolean" ? root.diveMarks : DEFAULT_SETTINGS.diveMarks,
    beachball: root.beachball === "bowl" ? "bowl" : DEFAULT_SETTINGS.beachball,
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

/** Reader-tunable settings, persisted in localStorage; the ◆ marks and beachball switches are in the settings menu. */
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
