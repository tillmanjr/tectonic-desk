import type {
  ApiEventCount,
  ApiEventDetail,
  ApiEventGrid,
  ApiEventList,
  ApiEventSummary,
} from "@tectonic/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { upsertEvents } from "../../src/repositories/events.js";
import { upsertMechanism } from "../../src/repositories/mechanisms.js";
import { makeEvent, makeMechanism } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const NOW = new Date("2026-10-13T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe.skipIf(!docker)("events routes", () => {
  let t: TestDb;
  let app: FastifyInstance;
  beforeAll(async () => {
    t = await startPostgres();
    app = buildApp({ db: t.db, now: () => NOW });
  });
  afterAll(async () => {
    await app.close();
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
    await upsertEvents(t.db, [
      makeEvent({ id: "a", time: daysAgo(1), mag: 5.5, latitude: -18.7, longitude: -175.1 }),
      makeEvent({ id: "b", time: daysAgo(10), mag: 3.0, latitude: 37.0, longitude: -122.0 }),
      makeEvent({ id: "c", time: daysAgo(2), mag: 2.6, latitude: 40.0, longitude: -124.0 }),
      makeEvent({ id: "d", time: daysAgo(3), mag: 4.0, latitude: -17.0, longitude: 179.5 }),
    ]);
    await upsertMechanism(t.db, makeMechanism({ eventId: "a", source: "us", code: "m1" }));
    await upsertMechanism(
      t.db,
      makeMechanism({ eventId: "a", source: "nc", code: "m2", preferred: false }),
    );
    await upsertMechanism(
      t.db,
      makeMechanism({ eventId: "a", kind: "fm", source: "nc", code: "f1" }),
    );
  });

  const list = async (qs = ""): Promise<{ status: number; body: ApiEventList; cache: unknown }> => {
    const res = await app.inject({ method: "GET", url: `/api/events${qs}` });
    return {
      status: res.statusCode,
      body: res.json<ApiEventList>(),
      cache: res.headers["cache-control"],
    };
  };
  const ids = (body: ApiEventList) => body.events.map((e) => e.id);

  it("defaults to the last seven days, newest first, with preferred mechanisms inline", async () => {
    const { status, body, cache } = await list();
    expect(status).toBe(200);
    expect(cache).toBe("public, max-age=60");
    expect(ids(body)).toEqual(["a", "c", "d"]);
    expect(body).toMatchObject({
      count: 3,
      truncated: false,
      query: {
        since: "2026-10-06T12:00:00.000Z",
        until: null,
        minMag: null,
        bbox: null,
        limit: 500,
      },
    });
    const a = body.events[0];
    expect(a?.mechanisms.map((m) => [m.kind, m.code])).toEqual([
      ["fm", "f1"],
      ["mt", "m1"],
    ]);
    expect(a?.time).toBe(daysAgo(1).toISOString());
    expect(a).not.toHaveProperty("raw");
    expect(body.events[1]?.mechanisms).toEqual([]);
  });

  it("applies since, until, minMag, bbox and limit", async () => {
    expect(ids((await list("?since=2026-10-01")).body)).toEqual(["a", "c", "d", "b"]);
    expect(ids((await list(`?until=${daysAgo(2.5).toISOString()}`)).body)).toEqual(["d"]);
    expect(ids((await list("?minMag=4")).body)).toEqual(["a", "d"]);
    expect(ids((await list("?since=2026-10-01&bbox=-136,27,-104,53")).body)).toEqual(["c", "b"]);
    expect(ids((await list("?bbox=170,-30,-170,-10")).body)).toEqual(["a", "d"]);
    const limited = (await list("?limit=2")).body;
    expect(ids(limited)).toEqual(["a", "c"]);
    expect(limited).toMatchObject({ count: 2, truncated: true, query: { limit: 2 } });
    expect((await list("?since=2030-01-01")).body).toMatchObject({ events: [], count: 0 });
  });

  it("counts, summarises and grids with the list filters and their own caching", async () => {
    const get = (url: string) => app.inject({ method: "GET", url });
    const count = await get("/api/events/count?minMag=3");
    expect(count.statusCode).toBe(200);
    expect(count.headers["cache-control"]).toBe("public, max-age=60");
    expect(count.json<ApiEventCount>()).toEqual({
      count: 2,
      query: { since: daysAgo(7).toISOString(), until: null, minMag: 3, bbox: null },
    });
    expect((await get("/api/events/count?limit=5")).statusCode).toBe(400);

    const summary = await get("/api/events/summary?since=2026-09-01");
    expect(summary.headers["cache-control"]).toBe("public, max-age=300");
    const s = summary.json<ApiEventSummary>();
    expect(s.by).toBe("day");
    expect(s.bins.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(s.bins[3]).toMatchObject({ maxMag: 5.5, mags: { m5: 1 } });
    expect((await get("/api/events/summary?by=week")).statusCode).toBe(400);

    const grid = await get("/api/events/grid?since=2026-09-01&cell=5");
    expect(grid.headers["cache-control"]).toBe("public, max-age=300");
    const g = grid.json<ApiEventGrid>();
    expect(g.cell).toBe(5);
    expect(g.cells).toEqual([
      { lat: -20, lon: -180, count: 1, maxMag: 5.5 },
      { lat: -20, lon: 175, count: 1, maxMag: 4.0 },
      { lat: 35, lon: -125, count: 1, maxMag: 3.0 },
      { lat: 40, lon: -125, count: 1, maxMag: 2.6 },
    ]);
    expect((await get("/api/events/grid?cell=3")).statusCode).toBe(400);
  });

  it("rejects bad input with 400", async () => {
    const { status, body } = await list("?until=2026-10-01");
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "invalid request" });
  });

  it("returns the detail with every product, stamps and usgs properties", async () => {
    const res = await app.inject({ method: "GET", url: "/api/events/a" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    const d = res.json<ApiEventDetail>();
    expect(d.mechanisms.map((m) => [m.kind, m.preferred, m.code])).toEqual([
      ["fm", true, "f1"],
      ["mt", true, "m1"],
      ["mt", false, "m2"],
    ]);
    expect(d.usgs).toEqual({ title: "M 5.5 - 122 km W of Neiafu, Tonga" });
    expect(typeof d.firstSeen).toBe("string");
    expect(d.detailCheckedUpdated).toBeNull();
    expect(d).not.toHaveProperty("raw");
  });

  it("404s an unknown event", async () => {
    const res = await app.inject({ method: "GET", url: "/api/events/nothing" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "event not found" });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
