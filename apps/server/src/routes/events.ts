import type {
  ApiEventCount,
  ApiEventGrid,
  ApiEventList,
  ApiEventSummary,
  ApiShakeMap,
} from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { HttpError, notFound } from "../api/errors.js";
import {
  eventIdSchema,
  parseEventsFilter,
  parseEventsQuery,
  parseGridQuery,
  parseOrThrow,
  parseSummaryQuery,
  toListFilter,
} from "../api/schemas.js";
import { isoOrNull, toApiEvent, toApiEventDetail, toApiFilter } from "../api/serialize.js";
import {
  countEvents,
  getEvent,
  gridEvents,
  listEventsWithPreferred,
  summarizeEvents,
} from "../repositories/events.js";

export const eventRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/events", async (request, reply): Promise<ApiEventList> => {
    const q = parseEventsQuery(request.query, app.now());
    const rows = await listEventsWithPreferred(app.db, toListFilter(q));
    cacheFor(reply, 60);
    return {
      events: rows.map((e) => toApiEvent(e, e.mechanisms)),
      count: rows.length,
      truncated: rows.length >= q.limit,
      query: { ...toApiFilter(q), limit: q.limit },
    };
  });

  app.get("/api/events/count", async (request, reply): Promise<ApiEventCount> => {
    const q = parseEventsFilter(request.query, app.now());
    const total = await countEvents(app.db, toListFilter(q));
    cacheFor(reply, 60);
    return { count: total, query: toApiFilter(q) };
  });

  app.get("/api/events/summary", async (request, reply): Promise<ApiEventSummary> => {
    const q = parseSummaryQuery(request.query, app.now());
    const bins = await summarizeEvents(app.db, toListFilter(q), q.by);
    cacheFor(reply, 300);
    return {
      by: q.by,
      bins: bins.map((b) => ({ ...b, start: b.start.toISOString() })),
      query: toApiFilter(q),
    };
  });

  app.get("/api/events/grid", async (request, reply): Promise<ApiEventGrid> => {
    const q = parseGridQuery(request.query, app.now());
    const cells = await gridEvents(app.db, toListFilter(q), q.cell);
    cacheFor(reply, 300);
    return { cell: q.cell, cells, query: toApiFilter(q) };
  });

  app.get("/api/events/:id", async (request, reply) => {
    const { id } = parseOrThrow(eventIdSchema, request.params);
    const event = await getEvent(app.db, id);
    if (!event) throw notFound("event not found");
    cacheFor(reply, 60);
    return toApiEventDetail(event);
  });

  // Read from USGS on demand through the cache; no database row is needed, so an event the
  // catalogue has not ingested yet still has its ShakeMap.
  app.get("/api/events/:id/shakemap", async (request, reply): Promise<ApiShakeMap> => {
    const { id } = parseOrThrow(eventIdSchema, request.params);
    let map;
    try {
      map = await app.shakemaps.get(id);
    } catch (err: unknown) {
      request.log.warn({ id, err }, "shakemap unavailable");
      throw new HttpError(502, "shakemap unavailable");
    }
    if (map === null) throw notFound("no ShakeMap for this event");
    cacheFor(reply, 600);
    return { ...map, processed: isoOrNull(map.processed) };
  });

  done();
};
