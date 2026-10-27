import { SUN_FRAMES, type SunFrameMeta, type SunKey, type SunSize } from "@tectonic/shared";
import type { IngestLogger } from "../ingest/context.js";
import { SpaceHttpError } from "./client.js";

/**
 * The latest Sun frames, proxied and held in memory: SDO's "latest" JPEGs (no-cache upstream,
 * refreshed every 10 to 15 minutes) and SOHO's LASCO realtime frames (every 12 minutes). A frame
 * is fetched again once it is older than the ttl; while upstream is down the last copy serves.
 */

export const SDO_BASE = "https://sdo.gsfc.nasa.gov/assets/img/latest/";
export const SOHO_BASE = "https://soho.nascom.nasa.gov/data/realtime/";

/** SDO's file codes per key; SOHO keys are their own directory names. */
const SDO_CHANNEL: Partial<Record<SunKey, string>> = {
  aia193: "0193",
  aia304: "0304",
  aia171: "0171",
  hmii: "HMIIC",
  hmib: "HMIB",
};

export function sunUrl(key: SunKey, size: SunSize): string {
  const channel = SDO_CHANNEL[key];
  if (channel !== undefined) return `${SDO_BASE}latest_${String(size)}_${channel}.jpg`;
  return `${SOHO_BASE}${key}/${String(size)}/latest.jpg`;
}

export interface SunImage {
  bytes: Buffer;
  contentType: string;
  /** Upstream `Last-Modified`, the nearest thing to the frame's time; null when absent. */
  lastModified: Date | null;
  fetchedAt: Date;
}

export interface SunCacheOptions {
  fetch?: typeof fetch;
  userAgent: string;
  /** How long a copy serves before it is fetched again; default 5 minutes. */
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
  log?: Pick<IngestLogger, "warn">;
}

export interface SunCache {
  get: (key: SunKey, size: SunSize) => Promise<SunImage>;
  /** Refreshes the seven thumbnails and describes them, in catalogue order. */
  metas: () => Promise<SunFrameMeta[]>;
}

export function createSunCache(opts: SunCacheOptions): SunCache {
  const doFetch = opts.fetch ?? fetch;
  const ttlMs = opts.ttlMs ?? 300_000;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const now = opts.now ?? ((): Date => new Date());
  const copies = new Map<string, SunImage>();
  const inflight = new Map<string, Promise<SunImage>>();

  async function download(key: SunKey, size: SunSize): Promise<SunImage> {
    const url = sunUrl(key, size);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": opts.userAgent, accept: "image/jpeg" },
        signal: controller.signal,
      });
      if (!res.ok) throw new SpaceHttpError(res.status, url);
      const modified = res.headers.get("last-modified");
      const ms = modified === null ? Number.NaN : Date.parse(modified);
      return {
        bytes: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") ?? "image/jpeg",
        lastModified: Number.isNaN(ms) ? null : new Date(ms),
        fetchedAt: now(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** A fresh copy, the shared download in progress, or the stale copy when the download fails. */
  function get(key: SunKey, size: SunSize): Promise<SunImage> {
    const id = `${key}/${String(size)}`;
    const have = copies.get(id);
    if (have !== undefined && now().getTime() - have.fetchedAt.getTime() < ttlMs) {
      return Promise.resolve(have);
    }
    const running = inflight.get(id);
    if (running !== undefined) return running;
    const p = download(key, size)
      .then((img) => {
        copies.set(id, img);
        return img;
      })
      .catch((err: unknown) => {
        const stale = copies.get(id);
        if (stale === undefined) throw err;
        opts.log?.warn({ key, size, err }, "sun frame refresh failed; serving the last copy");
        // The stale copy counts as fresh again, so a dead upstream is retried once per ttl.
        const kept = { ...stale, fetchedAt: now() };
        copies.set(id, kept);
        return kept;
      })
      .finally(() => {
        inflight.delete(id);
      });
    inflight.set(id, p);
    return p;
  }

  return {
    get,
    metas: () =>
      Promise.all(
        SUN_FRAMES.map(async (f) => {
          const img = await get(f.key, 512);
          return { key: f.key, time: img.lastModified, bytes: img.bytes.byteLength };
        }),
      ),
  };
}
