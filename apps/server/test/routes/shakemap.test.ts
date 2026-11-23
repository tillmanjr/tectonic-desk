import type { ApiError, ApiShakeMap, ShakeMap } from "@tectonic/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";
import type { ShakeMapCache } from "../../src/usgs/shakemap-cache.js";

const db = {} as unknown as Db;
const MAP: ShakeMap = {
  eventId: "us1",
  source: "us",
  version: 3,
  mapStatus: "reviewed",
  processed: new Date("2026-11-20T01:02:03Z"),
  maxMmi: 7.4,
  grid: { lon0: 10, lat0: 20, dLon: 1, dLat: 1, nx: 2, ny: 2, mmi: [1, 2, 3, null] },
};

function cacheAnswering(answer: (id: string) => Promise<ShakeMap | null>): ShakeMapCache {
  return { get: answer };
}

describe("GET /api/events/:id/shakemap", () => {
  it("answers the event's ShakeMap with its processing time as ISO, cached ten minutes", async () => {
    const app = buildApp({ db, shakemaps: cacheAnswering(() => Promise.resolve(MAP)) });
    const res = await app.inject({ method: "GET", url: "/api/events/us1/shakemap" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=600");
    expect(res.json<ApiShakeMap>()).toEqual({ ...MAP, processed: "2026-11-20T01:02:03.000Z" });
    await app.close();
  });

  it("answers 404 without a ShakeMap and 502 when USGS fails", async () => {
    const none = buildApp({ db, shakemaps: cacheAnswering(() => Promise.resolve(null)) });
    const res = await none.inject({ method: "GET", url: "/api/events/us1/shakemap" });
    expect(res.statusCode).toBe(404);
    expect(res.json<ApiError>().error).toBe("no ShakeMap for this event");
    await none.close();
    const down = buildApp({
      db,
      shakemaps: cacheAnswering(() => Promise.reject(new Error("down"))),
    });
    const bad = await down.inject({ method: "GET", url: "/api/events/us1/shakemap" });
    expect(bad.statusCode).toBe(502);
    expect(bad.json<ApiError>().error).toBe("shakemap unavailable");
    await down.close();
  });

  it("rejects an id that is too long", async () => {
    const app = buildApp({ db, shakemaps: cacheAnswering(() => Promise.resolve(MAP)) });
    const res = await app.inject({ method: "GET", url: `/api/events/${"x".repeat(65)}/shakemap` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("builds a default cache when none is given", () => {
    const app = buildApp({ db });
    expect(typeof app.shakemaps.get).toBe("function");
    void app.close();
  });
});
