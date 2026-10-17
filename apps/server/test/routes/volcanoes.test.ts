import type {
  ApiVolcanoChanges,
  ApiVolcanoDetail,
  ApiVolcanoReportList,
  ApiVolcanoStatusList,
} from "@tectonic/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { upsertReports } from "../../src/repositories/volcano-reports.js";
import { recordStatuses } from "../../src/repositories/volcano-status.js";
import { parseGeonet, parseHans, parseWeeklyReport } from "../../src/volcano/parse.js";
import { geonetVal, hansElevated, hansMonitored, weeklyRss } from "../support/volcano-stub.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const NOW = new Date("2026-10-17T12:00:00Z");
const t0 = new Date("2026-10-10T00:00:00Z");
const t1 = new Date("2026-10-16T00:00:00Z");

describe.skipIf(!docker)("volcano routes", () => {
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
    await recordStatuses(t.db, [
      ...parseHans(hansMonitored, hansElevated, t0),
      ...parseGeonet(geonetVal, t0),
    ]);
    const later = parseHans(hansMonitored, hansElevated, t1).map((s) =>
      s.key === "311120" ? { ...s, level: "WARNING", color: "RED" } : s,
    );
    await recordStatuses(t.db, later);
    await upsertReports(t.db, parseWeeklyReport(weeklyRss, t0));
  });

  const inject = (url: string) => app.inject({ method: "GET", url });

  it("returns the latest status per volcano with ISO stamps", async () => {
    const res = await inject("/api/volcanoes/status");
    const body = res.json<ApiVolcanoStatusList>();
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(body.generatedAt).toBe("2026-10-17T12:00:00.000Z");
    expect(body.statuses).toHaveLength(20);
    const sitkin = body.statuses.find((s) => s.key === "311120");
    expect(sitkin).toMatchObject({
      source: "usgs",
      number: 311120,
      level: "WARNING",
      color: "RED",
      noticeAt: "2026-10-16T19:14:32.000Z",
      observedAt: "2026-10-16T00:00:00.000Z",
    });
  });

  it("lists changes inside a day window and validates it", async () => {
    const recent = (await inject("/api/volcanoes/changes")).json<ApiVolcanoChanges>();
    expect(recent).toMatchObject({ days: 7 });
    expect(recent.changes.map((c) => c.key)).toEqual(["311120"]);
    const wide = (await inject("/api/volcanoes/changes?days=30")).json<ApiVolcanoChanges>();
    expect(wide.changes).toHaveLength(1);
    expect((await inject("/api/volcanoes/changes?days=0")).statusCode).toBe(400);
    expect((await inject("/api/volcanoes/changes?days=91")).statusCode).toBe(400);
  });

  it("lists the latest report weeks and validates the count", async () => {
    const res = await inject("/api/volcanoes/reports?weeks=1");
    const one = res.json<ApiVolcanoReportList>();
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(one.weeks).toBe(1);
    expect(one.reports.map((r) => r.number)).toEqual([211060, 311120]);
    expect(one.reports[0]).toMatchObject({
      week: "2026-10-14T00:00:00.000Z",
      category: "new",
      fetchedAt: "2026-10-10T00:00:00.000Z",
    });
    const all = (await inject("/api/volcanoes/reports")).json<ApiVolcanoReportList>();
    expect(all.weeks).toBe(4);
    expect(all.reports).toHaveLength(3);
    expect((await inject("/api/volcanoes/reports?weeks=27")).statusCode).toBe(400);
  });

  it("returns one volcano's status history and reports, and rejects a bad number", async () => {
    const res = await inject("/api/volcanoes/311120");
    const body = res.json<ApiVolcanoDetail>();
    expect(res.statusCode).toBe(200);
    expect(body.number).toBe(311120);
    expect(body.statuses.map((s) => s.level)).toEqual(["WARNING", "WATCH"]);
    expect(body.reports.map((r) => r.title)).toEqual([
      "Great Sitkin (United States) - Ongoing Activity",
    ]);
    const empty = (await inject("/api/volcanoes/999999")).json<ApiVolcanoDetail>();
    expect(empty).toEqual({ number: 999999, statuses: [], reports: [] });
    expect((await inject("/api/volcanoes/etna")).statusCode).toBe(400);
    expect((await inject("/api/volcanoes/0")).statusCode).toBe(400);
  });
});

if (!docker) {
  it("skipped: Docker is not reachable", () => {
    expect(true).toBe(true);
  });
}
