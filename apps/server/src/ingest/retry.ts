import { UsgsHttpError } from "../usgs/client.js";
import type { IngestLogger } from "./context.js";

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  sleep: (ms: number) => Promise<void>;
  log: IngestLogger;
}

/** Rate limits, server errors, timeouts and network failures deserve another try; a 4xx does not. */
export const retryable = (err: unknown): boolean =>
  !(err instanceof UsgsHttpError) || err.status === 429 || err.status >= 500;

/** Calls `fn` up to `attempts` times, doubling the pause from `baseMs` after each retryable failure. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const baseMs = opts.baseMs ?? 5_000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !retryable(err)) throw err;
      const delayMs = baseMs * 2 ** (attempt - 1);
      opts.log.warn({ err, attempt, delayMs }, "usgs request failed; retrying");
      await opts.sleep(delayMs);
    }
  }
}
