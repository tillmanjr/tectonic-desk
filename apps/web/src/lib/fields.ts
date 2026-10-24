import type { FieldId, FieldRaster, FieldsFile, FieldView } from "@tectonic/shared";
import type { ApiClient } from "./api.js";

/** What the map's Field select offers. */
export type FieldChoice = "none" | FieldId;
export const FIELD_CHOICES: readonly { id: FieldChoice; label: string }[] = [
  { id: "none", label: "none" },
  { id: "gravity", label: "gravity" },
  { id: "magnetic", label: "magnetic" },
];

let cached: Promise<FieldsFile> | null = null;

/** The rasters file, fetched once per page; a failed fetch is forgotten so the next pick retries. */
export function loadFields(api: ApiClient): Promise<FieldsFile> {
  cached ??= api.fields().catch((e: unknown) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** Drops the cached file; for tests. */
export function resetFieldsCache(): void {
  cached = null;
}

/** Which raster a frame wants: the global one, or the West Coast conic's. */
export const viewOf = (global: boolean): FieldView => (global ? "global" : "wc");

/** The raster for a choice and view, or null when the choice is none or the file lacks it. */
export function rasterFor(
  file: FieldsFile | null,
  field: FieldChoice,
  view: FieldView,
): FieldRaster | null {
  if (file === null || field === "none") return null;
  return file.rasters.find((r) => r.field === field && r.view === view) ?? null;
}
