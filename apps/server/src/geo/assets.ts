import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GEO_NAMES = [
  "plates",
  "wc-land",
  "wc-states",
  "wc-qfaults",
  "volcanoes",
  "eruptions",
] as const;

export interface GeoAsset {
  body: Buffer;
  etag: string;
}

export type GeoAssets = ReadonlyMap<string, GeoAsset>;

/** `apps/server/data/geo/`, resolved from `src/` under tsx and from `dist/` after build. */
export const DEFAULT_GEO_DIR = fileURLToPath(new URL("../../data/geo/", import.meta.url));

/** Reads the geo files once; the ETag is the quoted SHA-1 of the body. */
export function loadGeoAssets(dir: string = DEFAULT_GEO_DIR): GeoAssets {
  const assets = new Map<string, GeoAsset>();
  for (const name of GEO_NAMES) {
    const body = readFileSync(join(dir, `${name}.json`));
    const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
    assets.set(name, { body, etag });
  }
  return assets;
}
