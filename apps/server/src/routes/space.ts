import { mapSeries, type ApiSpaceNow, type ApiSpaceWindow } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { parseSpaceWindow } from "../api/schemas.js";
import {
  iso,
  toApiSpaceAlert,
  toApiSpaceFlare,
  toApiSpaceReading,
  toApiSpaceScales,
} from "../api/serialize.js";
import {
  alertsBetween,
  flaresBetween,
  latestAlert,
  latestFlare,
  latestReadings,
  samplesBetween,
  scalesBetween,
} from "../repositories/space.js";

const DAY_MS = 86_400_000;

/** Midnight UTC of the day holding `d`. */
export const utcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const spaceRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/space/now", async (_request, reply): Promise<ApiSpaceNow> => {
    const now = app.now();
    const today = utcDay(now);
    const [readings, scales, flare, alert] = await Promise.all([
      latestReadings(app.db),
      scalesBetween(
        app.db,
        new Date(today.getTime() - DAY_MS),
        new Date(today.getTime() + 3 * DAY_MS),
      ),
      latestFlare(app.db),
      latestAlert(app.db),
    ]);
    cacheFor(reply, 60);
    return {
      generatedAt: iso(now),
      latest: mapSeries(readings, (r) => (r === null ? null : toApiSpaceReading(r))),
      scales: scales.map(toApiSpaceScales),
      latestFlare: flare === null ? null : toApiSpaceFlare(flare),
      latestAlert: alert === null ? null : toApiSpaceAlert(alert),
    };
  });

  app.get("/api/space/window", async (request, reply): Promise<ApiSpaceWindow> => {
    const { from, to, bucketSeconds } = parseSpaceWindow(request.query, app.now());
    const [samples, flares, alerts, scales] = await Promise.all([
      samplesBetween(app.db, from, to, bucketSeconds),
      flaresBetween(app.db, from, to),
      alertsBetween(app.db, from, to),
      scalesBetween(app.db, utcDay(from), utcDay(to)),
    ]);
    cacheFor(reply, 60);
    return {
      from: iso(from),
      to: iso(to),
      bucketSeconds,
      samples,
      flares: flares.map(toApiSpaceFlare),
      alerts: alerts.map(toApiSpaceAlert),
      scales: scales.map(toApiSpaceScales),
    };
  });

  done();
};
