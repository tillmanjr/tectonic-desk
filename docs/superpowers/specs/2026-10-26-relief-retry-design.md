# Relief Tile Fetch Retry

**Date:** 2026-10-26. **Status:** approved.

## Problem

`apps/server/src/relief-cli.ts` builds the relief grid in the server image's build stage by
downloading eight SRTM15+ JPEG 2000 tiles (about 3 MB each) from the GMT Oceania data server, the
only host that resolves. Each tile gets one plain `fetch`. On 2026-10-26 the Deploy workflow failed
because the first tile's connection timed out, and passed on a manual rerun. A transient network
fault should not fail a release.

## Design

A small tested module, `apps/server/src/geo/relief-fetch.ts`, owns the download. The CLI keeps the
disk cache and the decode loop and calls it for a missing tile.

```ts
export interface TileFetchOptions {
  fetch?: typeof fetch;            // injected in tests
  sleep?: (ms: number) => Promise<void>;
  log?: Pick<IngestLogger, "warn">;
  attempts?: number;               // 5
  baseMs?: number;                 // 10_000, doubled after each failure: 10, 20, 40, 80 s
  timeoutMs?: number;              // 120_000 per attempt, through AbortSignal.timeout
}

export class TileHttpError extends Error { status: number; url: string }
export const retryableTileError = (err: unknown): boolean;
export async function fetchTileBytes(url: string, opts?: TileFetchOptions): Promise<Buffer>;
```

- **Retryable:** any failure that is not a `TileHttpError`, or one with status 429 or 5xx. A 4xx
  other than 429 is thrown at once; the tile list is fixed, so a 404 is a bug, not weather.
- **Timeout:** each attempt passes `AbortSignal.timeout(timeoutMs)` to `fetch`, so a stalled
  connection or a stalled body becomes an `AbortError`, which is retryable.
- **Backoff:** `baseMs * 2 ** (attempt - 1)` after failures 1 to `attempts - 1`; the last failure
  is rethrown. Worst case per tile is about 2.5 minutes of waiting plus five 2-minute attempts,
  well inside the GitHub Actions job limit.
- **Logging:** a `warn` with `{ url, attempt, delayMs, err }` before each pause, through the
  `IngestLogger` shape so the CLI can pass a console-backed logger.

The ingest `withRetry` is not reused: its classification is bound to `UsgsHttpError`, its message
says "usgs request failed", and it has no per-attempt timeout, which is the failure that occurred.

## CLI change

`fetchTile(name)` in `relief-cli.ts` calls `fetchTileBytes(url)` with a console logger and
defaults, then writes the cache file. No new flags or environment variables.

## Testing

`apps/server/test/geo/relief-fetch.test.ts` with an injected `fetch` and a recorded `sleep`:
success on the first try; a 503 then a network error then success with delays 10 s and 20 s and two
warnings; give up after `attempts` with the last error; a 404 thrown without retry or sleep; and a
timeout: the stub fetch rejects when its signal aborts, with a short `timeoutMs`, and the next
attempt succeeds. The module sits under the 100 % coverage threshold; the CLI stays excluded.

## Out of scope

A mirror host, resuming partial downloads, parallel tile fetches.
