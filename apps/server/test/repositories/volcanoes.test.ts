import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getRun } from "../../src/repositories/ingest-runs.js";
import { syncVolcanoReports, syncVolcanoStatus } from "../../src/ingest/volcanoes.js";
import { listReports, reportsFor, upsertReports } from "../../src/repositories/volcano-reports.js";
import {
  latestStatuses,
  recordStatuses,
  statusChanges,
  statusHistory,
} from "../../src/repositories/volcano-status.js";
import { VolcanoHttpError } from "../../src/volcano/client.js";
import { parseGeonet, parseHans, parseWeeklyReport } from "../../src/volcano/parse.js";
import { recordingLogger } from "../support/fixtures.js";
import {
  geonetVal,
  hansElevated,
  hansMonitored,
  stubVolcano,
  weeklyRss,
} from "../support/volcano-stub.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const t0 = new Date("2026-10-17T00:00:00Z");
const t1 = new Date("2026-10-17T00:15:00Z");
const t2 = new Date("2026-10-17T00:30:00Z");

describe.skipIf(!docker)("volcano repositories and jobs", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
  });

  it("records only changes of level, colour or notice, and reads the latest, windows and history", async () => {
    const first = [...parseHans(hansMonitored, hansElevated, t0), ...parseGeonet(geonetVal, t0)];
    expect((await recordStatuses(t.db, first)).inserted).toBe(20);
    const again = [...parseHans(hansMonitored, hansElevated, t1), ...parseGeonet(geonetVal, t1)];
    expect((await recordStatuses(t.db, again)).inserted).toBe(0);
    const changed = again.map((s) =>
      s.key === "311120"
        ? { ...s, level: "WARNING", color: "RED", observedAt: t2 }
        : s.key === "whiteisland"
          ? { ...s, noticeAt: new Date("2026-10-17T00:20:00Z"), observedAt: t2 }
          : { ...s, observedAt: t2 },
    );
    expect((await recordStatuses(t.db, changed)).inserted).toBe(2);
    const latest = await latestStatuses(t.db);
    expect(latest).toHaveLength(20);
    expect(latest.find((r) => r.key === "311120")).toMatchObject({
      level: "WARNING",
      color: "RED",
    });
    expect(await statusChanges(t.db, t2)).toHaveLength(2);
    expect(await statusChanges(t.db, t0)).toHaveLength(2);
    expect(await statusChanges(t.db, new Date("2026-10-18T00:00:00Z"))).toHaveLength(0);
    const history = await statusHistory(t.db, 311120);
    expect(history.map((r) => r.level)).toEqual(["WARNING", "WATCH"]);
    expect(await statusHistory(t.db, 1)).toEqual([]);
  });

  it("upserts weekly report entries by volcano and week and lists the latest weeks", async () => {
    expect(await listReports(t.db, 4)).toEqual([]);
    const entries = parseWeeklyReport(weeklyRss, t0);
    expect(await upsertReports(t.db, entries)).toEqual({ inserted: 3, updated: 0 });
    const renamed = entries.map((e) => ({ ...e, title: `${e.title} (revised)`, fetchedAt: t1 }));
    expect(await upsertReports(t.db, renamed)).toEqual({ inserted: 0, updated: 3 });
    expect(await upsertReports(t.db, [])).toEqual({ inserted: 0, updated: 0 });
    const latestWeek = await listReports(t.db, 1);
    expect(latestWeek.map((r) => [r.number, r.category])).toEqual([
      [211060, "new"],
      [311120, "ongoing"],
    ]);
    expect(latestWeek[0]?.title).toContain("(revised)");
    expect(await listReports(t.db, 5)).toHaveLength(3);
    expect((await reportsFor(t.db, 241100)).map((r) => r.week.toISOString())).toEqual([
      "2026-10-07T00:00:00.000Z",
    ]);
  });

  it("runs the status job, tolerating one failed source and failing when both fail", async () => {
    const log = recordingLogger();
    let clock = t0;
    const ctx = { db: t.db, volcano: stubVolcano(), log, now: () => clock };
    const ok = await syncVolcanoStatus(ctx);
    expect(ok).toMatchObject({ fetched: { usgs: 8, geonet: 12 }, inserted: 20 });
    expect(await getRun(t.db, ok.runId)).toMatchObject({
      kind: "volcano_status",
      ok: true,
      eventsInserted: 20,
      error: null,
    });
    clock = t1;
    const partial = await syncVolcanoStatus({
      ...ctx,
      volcano: stubVolcano({ geonet: new Error("geonet down") }),
    });
    expect(partial).toMatchObject({ fetched: { usgs: 8 }, inserted: 0 });
    expect(await getRun(t.db, partial.runId)).toMatchObject({
      ok: true,
      error: "geonet: geonet down",
    });
    expect(log.entries.some((e) => e.level === "warn")).toBe(true);
    const broken = stubVolcano({
      monitored: new Error("hans down"),
      geonet: new Error("geonet down"),
    });
    await expect(syncVolcanoStatus({ ...ctx, volcano: broken })).rejects.toThrow(
      "usgs: hans down; geonet: geonet down",
    );
    const failed = await getRun(t.db, partial.runId + 1);
    expect(failed).toMatchObject({ ok: false, error: "usgs: hans down; geonet: geonet down" });
  });

  it("runs the report job and records a blocked feed as a failed run", async () => {
    const log = recordingLogger();
    const ctx = { db: t.db, volcano: stubVolcano(), log, now: () => t0 };
    const ok = await syncVolcanoReports(ctx);
    expect(ok).toMatchObject({ entries: 3, inserted: 3, updated: 0 });
    expect(await getRun(t.db, ok.runId)).toMatchObject({
      kind: "volcano_reports",
      ok: true,
      eventsInserted: 3,
    });
    const blocked = stubVolcano({
      weekly: new VolcanoHttpError(403, "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml"),
    });
    await expect(syncVolcanoReports({ ...ctx, volcano: blocked })).rejects.toThrow("403");
    expect(await getRun(t.db, ok.runId + 1)).toMatchObject({
      ok: false,
      error: "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml answered 403",
    });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable", () => {
    expect(true).toBe(true);
  });
}
