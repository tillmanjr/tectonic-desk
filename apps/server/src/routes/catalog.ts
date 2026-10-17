import type { ApiCoverage } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { iso } from "../api/serialize.js";
import { coverageSpans } from "../repositories/catalog-windows.js";

/** What the catalogue holds for certain: the frozen backfill spans. */
export const catalogRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/catalog/coverage", async (_request, reply): Promise<ApiCoverage> => {
    const spans = await coverageSpans(app.db);
    cacheFor(reply, 300);
    return {
      spans: spans.map((s) => ({
        from: iso(s.from),
        to: iso(s.to),
        minMag: s.minMag,
        bbox: s.bbox,
        events: s.events,
        windows: s.windows,
      })),
    };
  });
  done();
};
