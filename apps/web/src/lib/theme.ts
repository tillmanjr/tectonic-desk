import { computed, ref, watchEffect, type ComputedRef, type Ref } from "vue";

export type ThemeMode = "auto" | "light" | "dark";

const KEY = "td-theme";
const NEXT: Record<ThemeMode, ThemeMode> = { auto: "light", light: "dark", dark: "auto" };

type StorageLike = Pick<Storage, "getItem" | "setItem">;
interface MediaLike {
  matches: boolean;
  addEventListener(type: "change", listener: (e: { matches: boolean }) => void): void;
}

export interface ThemeOptions {
  storage?: StorageLike | null;
  media?: MediaLike;
  root?: HTMLElement;
}

export interface Theme {
  mode: Ref<ThemeMode>;
  resolved: ComputedRef<"light" | "dark">;
  set(mode: ThemeMode): void;
  cycle(): void;
}

function isMode(v: string | null): v is ThemeMode {
  return v === "auto" || v === "light" || v === "dark";
}

/** auto / light / dark, persisted, applied as `data-theme` on the root element. */
export function createTheme(opts: ThemeOptions = {}): Theme {
  const storage = opts.storage === undefined ? localStorage : opts.storage;
  const media = opts.media ?? matchMedia("(prefers-color-scheme: dark)");
  const root = opts.root ?? document.documentElement;
  const stored = storage?.getItem(KEY) ?? null;
  const mode = ref<ThemeMode>(isMode(stored) ? stored : "auto");
  const systemDark = ref(media.matches);
  media.addEventListener("change", (e) => {
    systemDark.value = e.matches;
  });
  const resolved = computed(() =>
    mode.value === "auto" ? (systemDark.value ? "dark" : "light") : mode.value,
  );
  watchEffect(() => {
    if (mode.value === "auto") delete root.dataset.theme;
    else root.dataset.theme = mode.value;
  });
  function set(m: ThemeMode): void {
    mode.value = m;
    try {
      storage?.setItem(KEY, m);
    } catch {
      // storage full or disabled; the choice still applies for this page
    }
  }
  return {
    mode,
    resolved,
    set,
    cycle: () => {
      set(NEXT[mode.value]);
    },
  };
}
