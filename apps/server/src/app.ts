import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerErrorHandlers } from "./api/errors.js";
import type { Db } from "./db/client.js";
import { loadGeoAssets, type GeoAssets } from "./geo/assets.js";
import { geoRoutes } from "./routes/geo.js";
import { healthRoutes } from "./routes/health.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    now: () => Date;
    geo: GeoAssets;
  }
}

export interface AppOptions {
  db: Db;
  logger?: FastifyServerOptions["logger"];
  /** Clock for default windows and status stamps; injectable for tests. */
  now?: () => Date;
  /** Directory holding the geo JSON files; defaults to apps/server/data/geo. */
  geoDir?: string;
}

/** Builds the Fastify app without listening, so tests can inject requests. */
export function buildApp({
  db,
  logger = false,
  now = () => new Date(),
  geoDir,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  app.decorate("db", db);
  app.decorate("now", now);
  app.decorate("geo", loadGeoAssets(geoDir));
  registerErrorHandlers(app);
  void app.register(healthRoutes);
  void app.register(geoRoutes);
  return app;
}
