import type { ApiCoverage } from "@tectonic/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { recordWindow } from "../../src/repositories/catalog-windows.js";
import { startRun } from "../../src/repositories/ingest-runs.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("catalog routes", () => {
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

  it("reports frozen coverage as spans with ISO stamps", async () => {
    const runId = await startRun(t.db, "backfill");
    const base = { minMag: 2.5, bbox: null, pages: 1, runId, completedAt: new Date() };
    await recordWindow(t.db, {
      ...base,
      from: new Date("2020-01-01T00:00:00Z"),
      to: new Date("2020-02-01T00:00:00Z"),
      events: 3,
    });
    await recordWindow(t.db, {
      ...base,
      from: new Date("2020-02-01T00:00:00Z"),
      to: new Date("2020-03-01T00:00:00Z"),
      events: 4,
    });
    const res = await app.inject({ method: "GET", url: "/api/catalog/coverage" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.json<ApiCoverage>()).toEqual({
      spans: [
        {
          from: "2020-01-01T00:00:00.000Z",
          to: "2020-03-01T00:00:00.000Z",
          minMag: 2.5,
          bbox: null,
          events: 7,
          windows: 2,
        },
      ],
    });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable", () => {
    expect(true).toBe(true);
  });
}
