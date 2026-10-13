import type { ApiRun } from "@tectonic/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { finishRun, startRun } from "../../src/repositories/ingest-runs.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("GET /api/runs", () => {
  let t: TestDb;
  let app: FastifyInstance;
  beforeAll(async () => {
    t = await startPostgres();
    app = buildApp({ db: t.db });
  });
  afterAll(async () => {
    await app.close();
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
  });

  it("lists runs newest first, filtered by kind and limited", async () => {
    const r1 = await startRun(t.db, "feed_day", {}, new Date("2026-10-13T01:00:00Z"));
    await finishRun(t.db, r1, { ok: true }, new Date("2026-10-13T01:00:05Z"));
    const r2 = await startRun(t.db, "backfill", { days: 90 }, new Date("2026-10-13T02:00:00Z"));
    const r3 = await startRun(t.db, "feed_day", {}, new Date("2026-10-13T03:00:00Z"));

    const all = await app.inject({ method: "GET", url: "/api/runs" });
    expect(all.statusCode).toBe(200);
    expect(all.headers["cache-control"]).toBe("public, max-age=15");
    const runs = all.json<{ runs: ApiRun[] }>().runs;
    expect(runs.map((r) => r.id)).toEqual([r3, r2, r1]);
    expect(runs[2]).toMatchObject({
      kind: "feed_day",
      ok: true,
      startedAt: "2026-10-13T01:00:00.000Z",
      finishedAt: "2026-10-13T01:00:05.000Z",
    });
    expect(runs[1]).toMatchObject({
      kind: "backfill",
      ok: null,
      finishedAt: null,
      detail: { days: 90 },
    });

    const filtered = await app.inject({ method: "GET", url: "/api/runs?kind=feed_day&limit=1" });
    expect(filtered.json<{ runs: ApiRun[] }>().runs.map((r) => r.id)).toEqual([r3]);
  });

  it("rejects an unknown kind", async () => {
    const res = await app.inject({ method: "GET", url: "/api/runs?kind=sweep" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ issues: [{ path: "kind" }] });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
