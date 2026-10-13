import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Db } from "./db/client.js";
import { healthRoutes } from "./routes/health.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}

export interface AppOptions {
  db: Db;
  logger?: FastifyServerOptions["logger"];
}

/** Builds the Fastify app without listening, so tests can inject requests. */
export function buildApp({ db, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  app.decorate("db", db);
  void app.register(healthRoutes);
  return app;
}
