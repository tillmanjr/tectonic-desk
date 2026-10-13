import { sql } from "drizzle-orm";
import type { FastifyPluginCallback } from "fastify";

export const healthRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/health", async (_request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: "ok", db: "ok" };
    } catch (err) {
      app.log.error({ err }, "database health check failed");
      void reply.code(503);
      return { status: "degraded", db: "error" };
    }
  });
  done();
};
