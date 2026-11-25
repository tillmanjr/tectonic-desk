import type { ShakeMap } from "@tectonic/shared";
import type { IngestLogger } from "../ingest/context.js";
import { UsgsHttpError, type UsgsClient } from "./client.js";
import { epicentreOf, parseCoverage, pickShakeProduct, shakeMapOf } from "./shakemap.js";

/**
 * ShakeMaps read on demand and held in memory: one detail request to find the preferred
 * product, one for its MMI coverage. A ShakeMap is revised (new versions, automatic to
 * reviewed) for hours after an event, so a copy serves for the ttl and is then read again;
 * while USGS fails, the last copy keeps serving. "None" (no product, unknown event) is cached
 * the same way, so a repeated miss costs one upstream request per ttl.
 */

export interface ShakeMapCacheOptions {
  usgs: Pick<UsgsClient, "fetchDetail" | "fetchJson">;
  /** How long a copy serves before it is read again; default 10 minutes. */
  ttlMs?: number;
  /** How many events are held; the least recently fetched goes first. Default 64. */
  maxEntries?: number;
  now?: () => Date;
  log?: Pick<IngestLogger, "warn">;
}

export interface ShakeMapCache {
  /** The event's ShakeMap, or null when it has none. Throws when USGS fails and no copy is held. */
  get: (eventId: string) => Promise<ShakeMap | null>;
}

interface Entry {
  map: ShakeMap | null;
  fetchedAt: number;
}

export function createShakeMapCache(opts: ShakeMapCacheOptions): ShakeMapCache {
  const ttlMs = opts.ttlMs ?? 600_000;
  const maxEntries = opts.maxEntries ?? 64;
  const now = opts.now ?? ((): Date => new Date());
  const copies = new Map<string, Entry>();
  const inflight = new Map<string, Promise<ShakeMap | null>>();

  async function read(eventId: string): Promise<ShakeMap | null> {
    let detail;
    try {
      detail = await opts.usgs.fetchDetail(eventId);
    } catch (err: unknown) {
      if (err instanceof UsgsHttpError && err.status === 404) return null;
      throw err;
    }
    const product = pickShakeProduct(detail);
    if (product === null) return null;
    const grid = parseCoverage(await opts.usgs.fetchJson(product.coverageUrl));
    return shakeMapOf(eventId, product, grid, epicentreOf(detail));
  }

  function keep(eventId: string, map: ShakeMap | null): void {
    copies.delete(eventId);
    copies.set(eventId, { map, fetchedAt: now().getTime() });
    for (const oldest of copies.keys()) {
      if (copies.size <= maxEntries) break;
      copies.delete(oldest);
    }
  }

  return {
    get(eventId) {
      const have = copies.get(eventId);
      if (have !== undefined && now().getTime() - have.fetchedAt < ttlMs) {
        return Promise.resolve(have.map);
      }
      const running = inflight.get(eventId);
      if (running !== undefined) return running;
      const p = read(eventId)
        .then((map) => {
          keep(eventId, map);
          return map;
        })
        .catch((err: unknown) => {
          const stale = copies.get(eventId);
          if (stale === undefined) throw err;
          opts.log?.warn({ eventId, err }, "shakemap refresh failed; serving the last copy");
          // The stale copy counts as fresh again, so a failing upstream is retried once per ttl.
          keep(eventId, stale.map);
          return stale.map;
        })
        .finally(() => {
          inflight.delete(eventId);
        });
      inflight.set(eventId, p);
      return p;
    },
  };
}
