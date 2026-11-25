import type { ApiRegion } from "@tectonic/shared";
import type { ApiClient } from "./api.js";
import type { FeatureCollection } from "geojson";
import {
  loadGlobeLand,
  loadWorld,
  regionBasemap,
  worldBasemap,
  type Basemap,
  type Topo,
} from "./geo.js";

const pending = new Map<string, Promise<Basemap>>();

/** One load per key, shared while in flight; a failed load is forgotten so the next call retries. */
function cached(key: string, make: () => Promise<Basemap>): Promise<Basemap> {
  const hit = pending.get(key);
  if (hit !== undefined) return hit;
  const p = make();
  pending.set(key, p);
  p.catch(() => pending.delete(key));
  return p;
}

/** The world land and borders, fetched once and shared by the maps, the thumbnails and the aurora pair. */
export function loadWorldBasemap(): Promise<Basemap> {
  return cached("world", async () => worldBasemap(await loadWorld()));
}

/**
 * The basemap for a region, fetched once per key (`world` for regions without a bbox) and shared
 * while in flight, so the map and the thumbnails read one copy.
 */
export function loadBasemapFor(api: ApiClient, region: ApiRegion): Promise<Basemap> {
  if (region.bbox === null) return loadWorldBasemap();
  return cached(region.id, async () => {
    // The API serves one set of regional outlines, clipped to the West Coast preset.
    const [land, states] = await Promise.all([api.geo("wc-land"), api.geo("wc-states")]);
    return regionBasemap(land as Topo, states as Topo);
  });
}

let globe: Promise<FeatureCollection> | null = null;
/** The centre globe's schematic land, fetched once; a failed load is forgotten so the next call retries. */
export function loadGlobeLandOnce(): Promise<FeatureCollection> {
  if (globe !== null) return globe;
  const p = loadGlobeLand();
  globe = p;
  p.catch(() => {
    globe = null;
  });
  return p;
}

/** Drops the cache; for tests. */
export function resetBasemapCache(): void {
  pending.clear();
  globe = null;
}
