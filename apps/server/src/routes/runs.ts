import type { ApiRun } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { parseOrThrow, runsQuerySchema } from "../api/schemas.js";
import { toApiRun } from "../api/serialize.js";
import { listRuns } from "../repositories/ingest-runs.js";

export const runRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/runs", async (request, reply): Promise<{ runs: ApiRun[] }> => {
    const q = parseOrThrow(runsQuerySchema, request.query);
    const rows = await listRuns(app.db, { kind: q.kind, limit: q.limit });
    cacheFor(reply, 15);
    return { runs: rows.map(toApiRun) };
  });
  done();
};
