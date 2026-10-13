import { parseArgs } from "node:util";
import pino from "pino";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { backfill } from "./ingest/backfill.js";
import type { IngestContext } from "./ingest/context.js";
import { syncDetails } from "./ingest/details.js";
import { syncFeed } from "./ingest/feed.js";
import { createUsgsClient } from "./usgs/client.js";

const usage = `usage:
  ingest feed day|week
  ingest details [--limit N]
  ingest backfill --days N [--window-days N]`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    days: { type: "string" },
    "window-days": { type: "string" },
    limit: { type: "string" },
  },
});

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty" } });
const { db, close } = createDb(config.DATABASE_URL);
const ctx: IngestContext = {
  db,
  usgs: createUsgsClient({ baseUrl: config.USGS_BASE_URL, userAgent: config.USGS_USER_AGENT }),
  log,
  now: () => new Date(),
};

const int = (v: string | undefined, name: string): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
};

try {
  const [command, arg] = positionals;
  if (command === "feed" && (arg === "day" || arg === "week")) {
    const r = await syncFeed(ctx, arg);
    log.info(r, "feed done");
  } else if (command === "details") {
    const limit = int(values.limit, "--limit");
    const r = await syncDetails(ctx, limit === undefined ? {} : { limit });
    log.info(r, "details done");
  } else if (command === "backfill") {
    const days = int(values.days, "--days");
    if (days === undefined) throw new Error("--days is required");
    const windowDays = int(values["window-days"], "--window-days");
    const r = await backfill(ctx, windowDays === undefined ? { days } : { days, windowDays });
    log.info(r, "backfill done");
  } else {
    console.error(usage);
    process.exitCode = 2;
  }
} catch (err) {
  log.error({ err }, "ingest failed");
  process.exitCode = 1;
} finally {
  await close();
}
