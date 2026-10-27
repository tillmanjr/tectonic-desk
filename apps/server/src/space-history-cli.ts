/**
 * Loads the space weather archives: GFZ's Kp, Ap, sunspot number and F10.7 since 1932 and
 * Kyoto's hourly Dst since 1957, in ten-year chunks newest first. Rerunning is safe: rows
 * upsert in place.
 *
 * Usage: `pnpm --filter @tectonic/server space:history [--from DATE] [--to DATE]`
 */
import { parseArgs } from "node:util";
import pino from "pino";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { backfillSpaceHistory, HISTORY_START } from "./ingest/space-history.js";
import type { SpaceContext } from "./ingest/space.js";
import { createSpaceClient } from "./space/client.js";
import { createHistoryClient } from "./space/history-client.js";

const { values } = parseArgs({ options: { from: { type: "string" }, to: { type: "string" } } });

function instant(text: string | undefined, name: string, fallback: Date): Date {
  if (text === undefined) return fallback;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) throw new Error(`${name}: not a date: ${text}`);
  return new Date(ms);
}

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty" } });
const { db, close } = createDb(config.DATABASE_URL);
const ctx: SpaceContext = {
  db,
  space: createSpaceClient({ userAgent: config.USGS_USER_AGENT }),
  history: createHistoryClient({ userAgent: config.USGS_USER_AGENT }),
  log,
  now: () => new Date(),
};

try {
  const to = instant(values.to, "--to", new Date());
  const from = instant(values.from, "--from", HISTORY_START);
  const r = await backfillSpaceHistory(ctx, { from, to });
  log.info(r, "space history done");
} catch (err) {
  log.error({ err }, "space history failed");
  process.exitCode = 1;
} finally {
  await close();
}
