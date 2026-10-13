import type { ApiRun, ApiStatus } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { iso, isoOrNull, toApiRun } from "../api/serialize.js";
import type { IngestRunRow } from "../db/schema.js";
import { catalogStats } from "../repositories/events.js";
import { lastSuccessfulFeedAt, latestRuns } from "../repositories/ingest-runs.js";

const runOrNull = (r: IngestRunRow | null): ApiRun | null => (r ? toApiRun(r) : null);

export const statusRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/status", async (_request, reply): Promise<ApiStatus> => {
    const [stats, runs, lastFeed] = await Promise.all([
      catalogStats(app.db),
      latestRuns(app.db),
      lastSuccessfulFeedAt(app.db),
    ]);
    cacheFor(reply, 15);
    return {
      generatedAt: iso(app.now()),
      events: {
        total: stats.events.total,
        newest: isoOrNull(stats.events.newest),
        oldest: isoOrNull(stats.events.oldest),
        withMechanism: stats.events.withMechanism,
      },
      mechanisms: { total: stats.mechanisms.total },
      runs: {
        feed_day: runOrNull(runs.feed_day),
        feed_week: runOrNull(runs.feed_week),
        backfill: runOrNull(runs.backfill),
        details: runOrNull(runs.details),
      },
      lastSuccessfulFeed: isoOrNull(lastFeed),
    };
  });
  done();
};
