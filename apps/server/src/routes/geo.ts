import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { notFound } from "../api/errors.js";

export const geoRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get<{ Params: { name: string } }>("/api/geo/:name", (request, reply) => {
    const asset = app.geo.get(request.params.name);
    if (!asset) throw notFound("unknown geo asset");
    void reply.header("etag", asset.etag);
    cacheFor(reply, 86_400);
    if (request.headers["if-none-match"] === asset.etag) return reply.code(304).send();
    return reply.type("application/json").send(asset.body);
  });
  done();
};
