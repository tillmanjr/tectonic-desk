import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { startScheduler } from "./ingest/scheduler.js";
import { buildLoggerOptions } from "./logging.js";
import { createUsgsClient } from "./usgs/client.js";

const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL);
const app = buildApp({ db, logger: buildLoggerOptions(config) });

if (config.INGEST_ENABLED) {
  const usgs = createUsgsClient({
    baseUrl: config.USGS_BASE_URL,
    userAgent: config.USGS_USER_AGENT,
  });
  const scheduler = startScheduler(
    { db, usgs, log: app.log, now: () => new Date() },
    { dayMs: config.INGEST_DAY_INTERVAL_MS, weekMs: config.INGEST_WEEK_INTERVAL_MS },
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
