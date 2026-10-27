import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { startScheduler, type ScheduledJob } from "./ingest/scheduler.js";
import { syncSpaceHistory } from "./ingest/space-history.js";
import { pruneSpace, syncSpaceEvents, syncSpaceFast, syncSpaceSlow } from "./ingest/space.js";
import { syncVolcanoReports, syncVolcanoStatus } from "./ingest/volcanoes.js";
import { buildLoggerOptions } from "./logging.js";
import { createSpaceClient } from "./space/client.js";
import { createHistoryClient } from "./space/history-client.js";
import { createUsgsClient } from "./usgs/client.js";
import { createVolcanoClient } from "./volcano/client.js";

const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL);
const app = buildApp({
  db,
  logger: buildLoggerOptions(config),
  rateLimit: { max: config.RATE_LIMIT_MAX, windowMs: config.RATE_LIMIT_WINDOW_MS },
  trustProxy: config.TRUST_PROXY,
});

if (config.INGEST_ENABLED) {
  const usgs = createUsgsClient({
    baseUrl: config.USGS_BASE_URL,
    userAgent: config.USGS_USER_AGENT,
  });
  const volcano = createVolcanoClient({ userAgent: config.USGS_USER_AGENT });
  const volcanoCtx = { db, volcano, log: app.log, now: () => new Date() };
  const space = createSpaceClient({ userAgent: config.USGS_USER_AGENT });
  const history = createHistoryClient({ userAgent: config.USGS_USER_AGENT });
  const spaceCtx = { db, space, history, log: app.log, now: () => new Date() };
  const spaceJobs: ScheduledJob[] = config.SPACE_ENABLED
    ? [
        {
          name: "space_fast",
          everyMs: config.SPACE_FAST_INTERVAL_MS,
          run: () => syncSpaceFast(spaceCtx),
        },
        {
          name: "space_events",
          everyMs: config.SPACE_EVENTS_INTERVAL_MS,
          run: () => syncSpaceEvents(spaceCtx),
        },
        {
          name: "space_slow",
          everyMs: config.SPACE_SLOW_INTERVAL_MS,
          run: () => syncSpaceSlow(spaceCtx),
        },
        {
          name: "space_prune",
          everyMs: config.SPACE_PRUNE_INTERVAL_MS,
          run: () => pruneSpace(spaceCtx),
        },
        {
          name: "space_history",
          everyMs: config.SPACE_HISTORY_INTERVAL_MS,
          run: () => syncSpaceHistory(spaceCtx),
        },
      ]
    : [];
  const scheduler = startScheduler(
    { db, usgs, log: app.log, now: () => new Date() },
    {
      dayMs: config.INGEST_DAY_INTERVAL_MS,
      weekMs: config.INGEST_WEEK_INTERVAL_MS,
      jobs: [
        {
          name: "volcano_status",
          everyMs: config.VOLCANO_STATUS_INTERVAL_MS,
          run: () => syncVolcanoStatus(volcanoCtx),
        },
        {
          name: "volcano_reports",
          everyMs: config.VOLCANO_REPORTS_INTERVAL_MS,
          run: () => syncVolcanoReports(volcanoCtx),
        },
        ...spaceJobs,
      ],
    },
  );
  app.addHook("onClose", () => scheduler.stop());
} else {
  app.log.info("ingest disabled by INGEST_ENABLED");
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.PORT, host: config.HOST });
