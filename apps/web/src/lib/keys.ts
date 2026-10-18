import { inject, type InjectionKey, type Ref } from "vue";
import type { ApiClient } from "./api.js";
import type { Catalog } from "./catalog.js";
import type { Clock } from "./clock.js";
import type { EventFilter } from "./filters.js";
import type { Zone } from "./format.js";
import type { SettingsStore } from "./settings.js";
import type { StatusPoll } from "./status.js";
import type { Theme } from "./theme.js";
import type { VolcanoFilter, VolcanoStore } from "./volcanoes.js";

export const API: InjectionKey<ApiClient> = Symbol("api");
export const CATALOG: InjectionKey<Catalog> = Symbol("catalog");
export const STATUS: InjectionKey<StatusPoll> = Symbol("status");
export const CLOCK: InjectionKey<Clock> = Symbol("clock");
export const THEME: InjectionKey<Theme> = Symbol("theme");
/** Select an event id (opens the detail panel) or null (closes it). */
export const SELECT: InjectionKey<(id: string | null) => void> = Symbol("select");
/** Replace the event filter (written to the URL by App). */
export const SET_FILTER: InjectionKey<(f: EventFilter) => void> = Symbol("setFilter");
export const VOLCANOES: InjectionKey<VolcanoStore> = Symbol("volcanoes");
/** Reader-tunable settings (card rows for now). */
export const SETTINGS: InjectionKey<SettingsStore> = Symbol("settings");
/** Select a GVP volcano number (opens the volcano panel) or null (closes it). */
export const SELECT_VOLCANO: InjectionKey<(number: number | null) => void> =
  Symbol("selectVolcano");
/** Replace the volcano refine filter (written to the URL by App). */
export const SET_VOLCANO_FILTER: InjectionKey<(f: VolcanoFilter) => void> =
  Symbol("setVolcanoFilter");
/** The zone every date and time is shown in. */
export const ZONE: InjectionKey<Readonly<Ref<Zone>>> = Symbol("zone");

export function useInjected<T>(key: InjectionKey<T>): T {
  const value = inject(key);
  if (value === undefined) throw new Error(`${String(key.description)} was not provided`);
  return value;
}
