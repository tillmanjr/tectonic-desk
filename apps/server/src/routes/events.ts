import type { ApiEventList } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { notFound } from "../api/errors.js";
import { eventIdSchema, parseEventsQuery, parseOrThrow, toListFilter } from "../api/schemas.js";
import { iso, isoOrNull, toApiEvent, toApiEventDetail } from "../api/serialize.js";
import { getEvent, listEventsWithPreferred } from "../repositories/events.js";

export const eventRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/events", async (request, reply): Promise<ApiEventList> => {
    const q = parseEventsQuery(request.query, app.now());
    const rows = await listEventsWithPreferred(app.db, toListFilter(q));
    cacheFor(reply, 60);
    return {
      events: rows.map((e) => toApiEvent(e, e.mechanisms)),
      count: rows.length,
      truncated: rows.length >= q.limit,
      query: {
        since: iso(q.since),
        until: isoOrNull(q.until),
        minMag: q.minMag,
        bbox: q.bbox,
        limit: q.limit,
      },
    };
  });

  app.get("/api/events/:id", async (request, reply) => {
    const { id } = parseOrThrow(eventIdSchema, request.params);
    const event = await getEvent(app.db, id);
    if (!event) throw notFound("event not found");
    cacheFor(reply, 60);
    return toApiEventDetail(event);
  });

  done();
};
