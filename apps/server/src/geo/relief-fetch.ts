/**
 * Downloads one relief tile with retries. The GMT data server is a single host that drops or
 * stalls a connection now and then, which once failed a release build; a stalled attempt is
 * aborted after `timeoutMs` and tried again, with the pause doubling from `baseMs`.
 */
import type { IngestLogger } from "../ingest/context.js";

export interface TileFetchOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: Pick<IngestLogger, "warn">;
  /** Attempts in all, default 5. */
  attempts?: number;
  /** First pause, default 10 s; then 20, 40, 80 s. */
  baseMs?: number;
  /** Per-attempt limit, default 120 s. */
  timeoutMs?: number;
}

export class TileHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`${url}: ${String(status)}`);
    this.name = "TileHttpError";
  }
}

/** Rate limits, server errors, timeouts and network failures deserve another try; another 4xx does not. */
export const retryableTileError = (err: unknown): boolean =>
  !(err instanceof TileHttpError) || err.status === 429 || err.status >= 500;

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function fetchTileBytes(url: string, opts: TileFetchOptions = {}): Promise<Buffer> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? realSleep;
  const attempts = opts.attempts ?? 5;
  const baseMs = opts.baseMs ?? 10_000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new TileHttpError(res.status, url);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= attempts || !retryableTileError(err)) throw err;
      const delayMs = baseMs * 2 ** (attempt - 1);
      opts.log?.warn({ url, attempt, delayMs, err }, "relief tile fetch failed; retrying");
      await sleep(delayMs);
    }
  }
}
