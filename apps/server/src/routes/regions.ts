import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { REGIONS } from "../regions.js";

export const regionRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/regions", (_request, reply) => {
    cacheFor(reply, 60);
    return REGIONS;
  });
  done();
};
