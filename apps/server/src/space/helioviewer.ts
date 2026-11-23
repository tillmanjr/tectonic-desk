import type { SunKey, SunMovieSize } from "@tectonic/shared";
import { z } from "zod";
import { SpaceHttpError } from "./client.js";

/**
 * Helioviewer's movie API (v2): queue a movie of one layer over a span, then poll its status
 * until it is built. Helioviewer keeps the file in its own cache and serves it by URL.
 */

export const HELIOVIEWER_BASE = "https://api.helioviewer.org/v2/";

/** Helioviewer's layer for each channel the Sun strip shows. */
const LAYER: Record<SunKey, string> = {
  aia193: "[SDO,AIA,AIA,193,1,100]",
  aia304: "[SDO,AIA,AIA,304,1,100]",
  aia171: "[SDO,AIA,AIA,171,1,100]",
  hmii: "[SDO,HMI,HMI,continuum,1,100]",
  hmib: "[SDO,HMI,HMI,magnetogram,1,100]",
  c2: "[SOHO,LASCO,C2,white-light,1,100]",
  c3: "[SOHO,LASCO,C3,white-light,1,100]",
};

/**
 * Arcseconds per pixel that frame the channel's field of view at 512 px: the AIA and HMI
 * disk with a margin, C2 to about 6 and C3 to about 30 solar radii. Halved at 1024 px.
 */
const SCALE_512: Record<SunKey, number> = {
  aia193: 4.8,
  aia304: 4.8,
  aia171: 4.8,
  hmii: 4.8,
  hmib: 4.8,
  c2: 22.5,
  c3: 112.5,
};

/** The frames Helioviewer spreads over the span; its own cap. */
export const MAX_FRAMES = 300;

export function queueUrl(key: SunKey, from: Date, to: Date, size: SunMovieSize): string {
  const q = new URLSearchParams({
    startTime: from.toISOString(),
    endTime: to.toISOString(),
    layers: LAYER[key],
    events: "",
    eventsLabels: "false",
    imageScale: String((SCALE_512[key] * 512) / size),
    x0: "0",
    y0: "0",
    width: String(size),
    height: String(size),
    format: "mp4",
    frameRate: "15",
    maxFrames: String(MAX_FRAMES),
    movieLength: "0",
    watermark: "false",
  });
  return `${HELIOVIEWER_BASE}queueMovie/?${q.toString()}`;
}

export const statusUrl = (id: string): string =>
  `${HELIOVIEWER_BASE}getMovieStatus/?${new URLSearchParams({ id, format: "mp4", verbose: "true" }).toString()}`;

const queuedSchema = z.object({ id: z.string().min(1) }).loose();
const errorSchema = z.object({ error: z.string() }).loose();
/** 0 queued, 1 processing, 2 finished, 3 failed. */
const statusSchema = z
  .object({
    status: z.number().int(),
    progress: z.number().nullable().optional(),
    url: z.string().optional(),
    error: z.string().optional(),
  })
  .loose();

export type MovieStatus =
  | { state: "building"; progress: number | null }
  | { state: "ready"; url: string }
  | { state: "failed"; error: string };

export interface HelioviewerClient {
  queueMovie: (key: SunKey, from: Date, to: Date, size: SunMovieSize) => Promise<string>;
  movieStatus: (id: string) => Promise<MovieStatus>;
}

export interface HelioviewerOptions {
  fetch?: typeof fetch;
  userAgent: string;
  timeoutMs?: number;
}

export function createHelioviewerClient(opts: HelioviewerOptions): HelioviewerClient {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  async function getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": opts.userAgent, accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new SpaceHttpError(res.status, url);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async queueMovie(key, from, to, size) {
      const body = await getJson(queueUrl(key, from, to, size));
      const refused = errorSchema.safeParse(body);
      if (refused.success) throw new Error(`helioviewer refused the movie: ${refused.data.error}`);
      return queuedSchema.parse(body).id;
    },
    async movieStatus(id) {
      const s = statusSchema.parse(await getJson(statusUrl(id)));
      if (s.status === 2 && s.url !== undefined) return { state: "ready", url: s.url };
      if (s.status === 3 || s.status === 2) {
        return { state: "failed", error: s.error ?? "helioviewer could not build the movie" };
      }
      // Helioviewer reports a fraction once it starts encoding.
      const p = s.progress ?? null;
      return { state: "building", progress: p === null ? null : Math.round(p * 100) };
    },
  };
}
