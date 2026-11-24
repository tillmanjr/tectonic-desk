import { MAP_LAYERS } from "./deep/map.js";
import { REFINE_SPACE, REFINE_TABLES, REFINE_VOLCANOES } from "./deep/refine.js";
import type { Tour } from "./tour.js";
import {
  EARTHQUAKES,
  MAP_NAV,
  MAP_TOOLS,
  MARKS,
  MECHANISM,
  ORIENTATION,
  REFINE_QUAKES,
  SPACE,
  VOLCANOES,
} from "./tour-steps.js";

/** The quick tours in the order "Continue to" takes them. */
export const QUICK_TOURS: readonly Tour[] = [
  ORIENTATION,
  MAP_TOOLS,
  EARTHQUAKES,
  VOLCANOES,
  MARKS,
  SPACE,
];

/** The deep dives, grouped by area in the order the Help menu lists them. */
export const DEEP_DIVES: readonly Tour[] = [
  REFINE_QUAKES,
  REFINE_VOLCANOES,
  REFINE_SPACE,
  REFINE_TABLES,
  MAP_NAV,
  MAP_LAYERS,
  MECHANISM,
];

/** Every tour, quick tours first. */
export const TOURS: readonly Tour[] = [...QUICK_TOURS, ...DEEP_DIVES];
