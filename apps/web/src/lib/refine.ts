import { hasRange, type DateSpan, type EventFilter } from "./filters.js";
import { fmtFloor } from "./format.js";
import {
  ERUPTION_CLASSES,
  SETTING_GROUPS,
  STATUS_FILTERS,
  TYPE_GROUPS,
  type VolcanoFilter,
} from "./volcanoes.js";

/** One clause of a collapsed refine bar; `set` means the reader chose it rather than a default. */
export interface SummaryPart {
  text: string;
  set: boolean;
}

/** The earthquake refinements in force as clauses: magnitude, window, depth. */
export function quakeParts(
  f: EventFilter,
  span: DateSpan,
  requested: number,
  spanLabel: string | null,
): SummaryPart[] {
  const mag =
    f.maxMag === null ? fmtFloor(requested) : `M${String(requested)} to M${String(f.maxMag)}`;
  const depth =
    f.minDepth !== null && f.maxDepth !== null
      ? `depth ${String(f.minDepth)}–${String(f.maxDepth)} km`
      : f.minDepth !== null
        ? `depth from ${String(f.minDepth)} km`
        : f.maxDepth !== null
          ? `depth to ${String(f.maxDepth)} km`
          : "depth any";
  return [
    { text: mag, set: f.minMag !== null || f.maxMag !== null },
    { text: `${spanLabel ?? "custom"} from ${span.since} to ${span.until}`, set: hasRange(f) },
    { text: depth, set: f.minDepth !== null || f.maxDepth !== null },
  ];
}

/** The volcano refinements in force as clauses, using the group labels. */
export function volcanoParts(f: VolcanoFilter): SummaryPart[] {
  const part = (name: string, label: string | null): SummaryPart => ({
    text: `${name} ${label ?? "any"}`,
    set: label !== null,
  });
  return [
    part("setting", f.setting === null ? null : SETTING_GROUPS[f.setting].toLowerCase()),
    part("type", f.type === null ? null : TYPE_GROUPS[f.type].toLowerCase()),
    part("last eruption", f.age === null ? null : ERUPTION_CLASSES[f.age].label.toLowerCase()),
    part("status", f.status === null ? null : STATUS_FILTERS[f.status].toLowerCase()),
  ];
}
