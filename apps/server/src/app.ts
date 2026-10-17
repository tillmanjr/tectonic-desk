import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { HttpError, registerErrorHandlers } from "./api/errors.js";
import type { Db } from "./db/client.js";
import { loadGeoAssets, type GeoAssets } from "./geo/assets.js";
import { eventRoutes } from "./routes/events.js";
import { geoRoutes } from "./routes/geo.js";
import { healthRoutes } from "./routes/health.js";
import { regionRoutes } from "./routes/regions.js";
import { runRoutes } from "./routes/runs.js";
import { statusRoutes } from "./routes/status.js";
import { volcanoRoutes } from "./routes/volcanoes.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    now: () => Date;
    geo: GeoAssets;
  }
}

export interface RateLimitOptions {
  /** Requests allowed per client address in each window; 0 turns the limiter off. */
  max: number;
  windowMs: number;
}

/** Generous for the dashboard (a client makes a few requests a minute), tight for a scraper. */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 120, windowMs: 60_000 };

export interface AppOptions {
  db: Db;
  logger?: FastifyServerOptions["logger"];
  rateLimit?: RateLimitOptions;
  /** Take the client address from X-Forwarded-For; set behind nginx, never on a directly exposed port. */
  trustProxy?: boolean;
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
  rateLimit: limit = DEFAULT_RATE_LIMIT,
  trustProxy = false,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger, trustProxy });
  app.decorate("db", db);
  app.decorate("now", now);
  app.decorate("geo", loadGeoAssets(geoDir));
  registerErrorHandlers(app);
  if (limit.max > 0) {
    void app.register(rateLimit, {
      max: limit.max,
      timeWindow: limit.windowMs,
      // The plugin throws what this returns; an HttpError renders in the `{ error }` shape.
      errorResponseBuilder: (_request, ctx) =>
        new HttpError(429, `too many requests, retry in ${String(Math.ceil(ctx.ttl / 1000))} s`),
    });
  }
  void app.register(healthRoutes);
  void app.register(regionRoutes);
  void app.register(eventRoutes);
  void app.register(statusRoutes);
  void app.register(runRoutes);
  void app.register(geoRoutes);
  void app.register(volcanoRoutes);
  return app;
}
