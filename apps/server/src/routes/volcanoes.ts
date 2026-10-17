import type {
  ApiVolcanoChanges,
  ApiVolcanoDetail,
  ApiVolcanoReportList,
  ApiVolcanoStatusList,
} from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import {
  parseOrThrow,
  volcanoChangesQuerySchema,
  volcanoNumberSchema,
  volcanoReportsQuerySchema,
} from "../api/schemas.js";
import { iso, toApiVolcanoReport, toApiVolcanoStatus } from "../api/serialize.js";
import { listReports, reportsFor } from "../repositories/volcano-reports.js";
import { latestStatuses, statusChanges, statusHistory } from "../repositories/volcano-status.js";

const DAY_MS = 86_400_000;

export const volcanoRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/volcanoes/status", async (_request, reply): Promise<ApiVolcanoStatusList> => {
    const rows = await latestStatuses(app.db);
    cacheFor(reply, 60);
    return { generatedAt: iso(app.now()), statuses: rows.map(toApiVolcanoStatus) };
  });

  app.get("/api/volcanoes/changes", async (request, reply): Promise<ApiVolcanoChanges> => {
    const { days } = parseOrThrow(volcanoChangesQuerySchema, request.query);
    const since = new Date(app.now().getTime() - days * DAY_MS);
    const rows = await statusChanges(app.db, since);
    cacheFor(reply, 60);
    return { days, changes: rows.map(toApiVolcanoStatus) };
  });

  app.get("/api/volcanoes/reports", async (request, reply): Promise<ApiVolcanoReportList> => {
    const { weeks } = parseOrThrow(volcanoReportsQuerySchema, request.query);
    const rows = await listReports(app.db, weeks);
    cacheFor(reply, 300);
    return { weeks, reports: rows.map(toApiVolcanoReport) };
  });

  app.get("/api/volcanoes/:number", async (request, reply): Promise<ApiVolcanoDetail> => {
    const { number } = parseOrThrow(volcanoNumberSchema, request.params);
    const [statuses, reports] = await Promise.all([
      statusHistory(app.db, number),
      reportsFor(app.db, number),
    ]);
    cacheFor(reply, 60);
    return {
      number,
      statuses: statuses.map(toApiVolcanoStatus),
      reports: reports.map(toApiVolcanoReport),
    };
  });

  done();
};
