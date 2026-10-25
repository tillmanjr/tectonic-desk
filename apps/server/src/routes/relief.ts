import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { notFound } from "../api/errors.js";
import { parseOrThrow, reliefQuerySchema } from "../api/schemas.js";
import { reliefAlong } from "../geo/relief.js";

/** Elevations along a section line, from the relief grid the image carries; 404 without one. */
export const reliefRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/relief", (request, reply) => {
    const q = parseOrThrow(reliefQuerySchema, request.query);
    const grid = app.relief;
    if (grid === null) throw notFound("relief grid not available");
    const [lon1, lat1, lon2, lat2] = q.section;
    cacheFor(reply, 86_400);
    return reliefAlong(grid, [lon1, lat1], [lon2, lat2], q.n, app.reliefLayout);
  });
  done();
};
