import { parseArgs } from "node:util";
import pino from "pino";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { backfill } from "./ingest/backfill.js";
import { parseBackfillArgs, positiveInt } from "./ingest/cli-args.js";
import type { IngestContext } from "./ingest/context.js";
import { syncDetails, type DetailsOptions } from "./ingest/details.js";
import { syncFeed } from "./ingest/feed.js";
import { createUsgsClient } from "./usgs/client.js";

const usage = `usage:
  ingest feed day|week
  ingest details [--limit N] [--by-magnitude]
  ingest backfill (--days N | --from DATE [--to DATE])
                  [--min-magnitude M | --all-magnitudes]
                  [--bbox minLon,minLat,maxLon,maxLat]
                  [--force] [--skip-details] [--pause-ms N]`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    days: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    "min-magnitude": { type: "string" },
    "all-magnitudes": { type: "boolean" },
    bbox: { type: "string" },
    force: { type: "boolean" },
    "skip-details": { type: "boolean" },
    "pause-ms": { type: "string" },
    limit: { type: "string" },
    "by-magnitude": { type: "boolean" },
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

try {
  const [command, arg] = positionals;
  if (command === "feed" && (arg === "day" || arg === "week")) {
    const r = await syncFeed(ctx, arg);
    log.info(r, "feed done");
  } else if (command === "details") {
    const opts: DetailsOptions = {};
    const limit = positiveInt(values.limit, "--limit");
    if (limit !== undefined) opts.limit = limit;
    if (values["by-magnitude"] === true) opts.order = "mag";
    const r = await syncDetails(ctx, opts);
    log.info(r, "details done");
  } else if (command === "backfill") {
    const r = await backfill(ctx, parseBackfillArgs(values, new Date()));
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
