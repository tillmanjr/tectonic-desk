import type { ApiStatus } from "@tectonic/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { upsertEvents } from "../../src/repositories/events.js";
import { finishRun, startRun } from "../../src/repositories/ingest-runs.js";
import { upsertMechanism } from "../../src/repositories/mechanisms.js";
import { makeEvent, makeMechanism } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const NOW = new Date("2026-10-13T12:00:00Z");

describe.skipIf(!docker)("GET /api/status", () => {
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
  });

  it("reports zeros and nulls on an empty catalog", async () => {
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=15");
    expect(res.json()).toEqual({
      generatedAt: "2026-10-13T12:00:00.000Z",
      events: { total: 0, newest: null, oldest: null, withMechanism: 0 },
      mechanisms: { total: 0 },
      runs: {
        feed_day: null,
        feed_week: null,
        backfill: null,
        details: null,
        volcano_status: null,
        volcano_reports: null,
      },
      lastSuccessfulFeed: null,
    });
  });

  it("reports counts, the latest run per kind and the last successful feed", async () => {
    await upsertEvents(t.db, [
      makeEvent({ id: "a", time: new Date("2026-10-12T00:00:00Z") }),
      makeEvent({ id: "b", time: new Date("2026-10-10T00:00:00Z") }),
    ]);
    await upsertMechanism(t.db, makeMechanism({ eventId: "a", code: "m1" }));
    await upsertMechanism(t.db, makeMechanism({ eventId: "a", kind: "fm", code: "f1" }));
    const t1 = new Date("2026-10-13T01:00:00Z");
    const t2 = new Date("2026-10-13T02:00:00Z");
    const ok = await startRun(t.db, "feed_day", {}, t1);
    await finishRun(t.db, ok, { ok: true, eventsInserted: 2 }, t1);
    const failed = await startRun(t.db, "feed_day", {}, t2);
    await finishRun(t.db, failed, { ok: false, error: "503" }, t2);

    const body = (await app.inject({ method: "GET", url: "/api/status" })).json<ApiStatus>();
    expect(body.events).toEqual({
      total: 2,
      newest: "2026-10-12T00:00:00.000Z",
      oldest: "2026-10-10T00:00:00.000Z",
      withMechanism: 1,
    });
    expect(body.mechanisms).toEqual({ total: 2 });
    expect(body.runs.feed_day).toMatchObject({ id: failed, ok: false, error: "503" });
    expect(body.runs.feed_week).toBeNull();
    expect(body.lastSuccessfulFeed).toBe("2026-10-13T01:00:00.000Z");
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
