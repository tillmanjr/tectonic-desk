import { inject, type InjectionKey } from "vue";
import type { ApiClient } from "./api.js";
import type { Catalog } from "./catalog.js";
import type { Clock } from "./clock.js";
import type { StatusPoll } from "./status.js";
import type { Theme } from "./theme.js";

export const API: InjectionKey<ApiClient> = Symbol("api");
export const CATALOG: InjectionKey<Catalog> = Symbol("catalog");
export const STATUS: InjectionKey<StatusPoll> = Symbol("status");
export const CLOCK: InjectionKey<Clock> = Symbol("clock");
export const THEME: InjectionKey<Theme> = Symbol("theme");
/** Select an event id (opens the detail panel) or null (closes it). */
export const SELECT: InjectionKey<(id: string | null) => void> = Symbol("select");

export function useInjected<T>(key: InjectionKey<T>): T {
  const value = inject(key);
  if (value === undefined) throw new Error(`${String(key.description)} was not provided`);
  return value;
}
