import type { ApiRegion } from "@tectonic/shared";
import type { ApiClient } from "./api.js";
import { loadWorld, regionBasemap, worldBasemap, type Basemap, type Topo } from "./geo.js";

const pending = new Map<string, Promise<Basemap>>();

/**
 * The basemap for a region, fetched once per key (`world` for regions without a bbox) and shared
 * while in flight, so the map and the thumbnails read one copy. A failed load is forgotten so the
 * next call retries.
 */
export function loadBasemapFor(api: ApiClient, region: ApiRegion): Promise<Basemap> {
  const key = region.bbox === null ? "world" : region.id;
  const hit = pending.get(key);
  if (hit !== undefined) return hit;
  const p = (async (): Promise<Basemap> => {
    if (region.bbox === null) return worldBasemap(await loadWorld());
    // The API serves one set of regional outlines, clipped to the West Coast preset.
    const [land, states] = await Promise.all([api.geo("wc-land"), api.geo("wc-states")]);
    return regionBasemap(land as Topo, states as Topo);
  })();
  pending.set(key, p);
  p.catch(() => pending.delete(key));
  return p;
}

/** Drops the cache; for tests. */
export function resetBasemapCache(): void {
  pending.clear();
}
