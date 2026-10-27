import { isSunKey, isSunSize, type ApiSunFrames } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { HttpError, notFound } from "../api/errors.js";
import { iso, isoOrNull } from "../api/serialize.js";

/** Frame reads get a looser limit: the strip asks for seven at once and the overlay for one more. */
export const SUN_FRAME_RATE_MAX = 600;

/** The Sun frames: a manifest with their times, and the bytes of one frame at one size. */
export const sunRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/space/sun", async (_request, reply): Promise<ApiSunFrames> => {
    const frames = await app.sun.metas();
    cacheFor(reply, 60);
    return {
      generatedAt: iso(app.now()),
      frames: frames.map((f) => ({ key: f.key, time: isoOrNull(f.time), bytes: f.bytes })),
    };
  });

  // The web puts the frame's time in the query, so a new frame is a new URL and an hour's cache is safe.
  app.get<{ Params: { key: string; size: string } }>(
    "/api/space/sun/:key/:size.jpg",
    { config: { rateLimit: { max: SUN_FRAME_RATE_MAX } } },
    async (request, reply) => {
      const { key, size } = request.params;
      const px = Number(size);
      if (!isSunKey(key) || !isSunSize(px)) throw notFound("sun frame not found");
      let image;
      try {
        image = await app.sun.get(key, px);
      } catch (err: unknown) {
        request.log.warn({ key, size: px, err }, "sun frame unavailable");
        throw new HttpError(502, "sun frame unavailable");
      }
      cacheFor(reply, 3600);
      void reply.type(image.contentType);
      if (image.lastModified !== null) {
        void reply.header("last-modified", image.lastModified.toUTCString());
      }
      return reply.send(image.bytes);
    },
  );

  done();
};
