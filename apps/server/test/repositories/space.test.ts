import { AURORA_CELLS, auroraIndex, type AuroraFrame, type SpaceSample } from "@tectonic/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  FINE_RETENTION_DAYS,
  pruneSpace,
  syncSpaceEvents,
  syncSpaceFast,
  syncSpaceSlow,
} from "../../src/ingest/space.js";
import {
  alertsBetween,
  auroraFrame,
  auroraFrames,
  downsampleBefore,
  flaresBetween,
  insertAlerts,
  insertAuroraFrame,
  latestAlert,
  latestAuroraFrame,
  latestFlare,
  latestReadings,
  pruneAurora,
  samplesBetween,
  scalesBetween,
  upsertFlares,
  upsertSamples,
  upsertScales,
} from "../../src/repositories/space.js";
import { kpMaxByDay, parseFlares, parseScales } from "../../src/space/parse.js";
import { recordingLogger } from "../support/fixtures.js";
import { aurora, flares, kpForecast, scales, stubSpace } from "../support/space-stub.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const NOW = new Date("2026-10-25T04:00:00Z");
const at = (iso: string): Date => new Date(iso);
const sample = (
  series: SpaceSample["series"],
  iso: string,
  value: number,
  source = "swpc",
): SpaceSample => ({ series, time: at(iso), source, value });

describe.skipIf(!docker)("space repository and jobs", () => {
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

  it("upserts samples in place, dedupes a batch, and reads the newest per series", async () => {
    expect(
      await upsertSamples(t.db, [
        sample("kp_1m", "2026-10-25T03:00:00Z", 2),
        sample("kp_1m", "2026-10-25T03:00:00Z", 2.33),
        sample("kp_1m", "2026-10-25T03:01:00Z", 2.67),
        sample("bt", "2026-10-25T03:01:00Z", 4.1, "SOLAR1"),
      ]),
    ).toBe(3);
    expect(await upsertSamples(t.db, [sample("kp_1m", "2026-10-25T03:01:00Z", 3)])).toBe(1);
    expect(await upsertSamples(t.db, [])).toBe(0);
    const latest = await latestReadings(t.db);
    expect(latest.kp_1m).toMatchObject({ time: at("2026-10-25T03:01:00Z"), value: 3 });
    expect(latest.bt).toMatchObject({ source: "SOLAR1", value: 4.1 });
    expect(latest.dst).toBeNull();
    const first = await samplesBetween(t.db, at("2026-10-25T02:00:00Z"), NOW, null);
    expect(first.kp_1m).toEqual([
      [at("2026-10-25T03:00:00Z").getTime(), 2.33],
      [at("2026-10-25T03:01:00Z").getTime(), 3],
    ]);
    expect(first.p10).toEqual([]);
  });

  it("thins a window to one shared bucket with means", async () => {
    const rows: SpaceSample[] = [];
    for (let m = 0; m < 20; m++) {
      rows.push(
        sample("speed", `2026-10-25T03:${String(m).padStart(2, "0")}:00Z`, 400 + m, "SOLAR1"),
      );
    }
    await upsertSamples(t.db, rows);
    const binned = await samplesBetween(t.db, at("2026-10-25T03:00:00Z"), NOW, 600);
    expect(binned.speed).toEqual([
      [at("2026-10-25T03:00:00Z").getTime(), 404.5],
      [at("2026-10-25T03:10:00Z").getTime(), 414.5],
    ]);
    const outside = await samplesBetween(
      t.db,
      at("2026-10-25T03:10:00Z"),
      at("2026-10-25T03:12:00Z"),
      null,
    );
    expect(outside.speed).toHaveLength(3);
  });

  it("fills flares as their end arrives, finds those overlapping a window, and the newest", async () => {
    const parsed = parseFlares(flares);
    expect(await upsertFlares(t.db, parsed)).toBe(3);
    expect(await upsertFlares(t.db, [])).toBe(0);
    const open = parsed[2];
    if (open === undefined) throw new Error("fixture lacks the open flare");
    expect((await latestFlare(t.db))?.endTime).toBeNull();
    await upsertFlares(t.db, [
      { ...open, endTime: at("2026-10-24T21:50:00Z"), endClass: "B4.0" },
      { ...open, endTime: at("2026-10-24T21:52:00Z"), endClass: "B4.1" },
    ]);
    expect(await latestFlare(t.db)).toMatchObject({
      beginTime: at("2026-10-24T21:38:00Z"),
      endTime: at("2026-10-24T21:52:00Z"),
      endClass: "B4.1",
    });
    // began before the window, ended inside it
    const overlap = await flaresBetween(
      t.db,
      at("2026-10-24T04:20:00Z"),
      at("2026-10-24T05:00:00Z"),
    );
    expect(overlap.map((f) => f.beginClass)).toEqual(["B5.3"]);
    const later = await flaresBetween(t.db, at("2026-10-24T06:00:00Z"), at("2026-10-25T00:00:00Z"));
    expect(later.map((f) => f.maxClass)).toEqual(["C1.0", "B5.2"]);
    expect(await flaresBetween(t.db, at("2026-10-25T01:00:00Z"), NOW)).toEqual([]);
  });

  it("ignores repeated alerts and lists a window newest first", async () => {
    const a = (
      id: string,
      iso: string,
    ): { productId: string; issueTime: Date; message: string } => ({
      productId: id,
      issueTime: at(iso),
      message: `${id} text`,
    });
    expect(
      await insertAlerts(t.db, [
        a("K04W", "2026-10-23T19:27:05.807Z"),
        a("K04A", "2026-10-23T19:55:04.007Z"),
        a("K04A", "2026-10-23T19:55:04.007Z"),
      ]),
    ).toBe(2);
    expect(await insertAlerts(t.db, [a("K04A", "2026-10-23T19:55:04.007Z")])).toBe(0);
    expect(await insertAlerts(t.db, [])).toBe(0);
    const listed = await alertsBetween(t.db, at("2026-10-23T00:00:00Z"), NOW);
    expect(listed.map((r) => r.productId)).toEqual(["K04A", "K04W"]);
    expect((await latestAlert(t.db))?.productId).toBe("K04A");
    expect(
      await alertsBetween(t.db, at("2026-10-23T19:30:00Z"), at("2026-10-23T19:40:00Z")),
    ).toEqual([]);
  });

  it("keeps the latest issue of a day's scales and never an older one", async () => {
    const rows = parseScales(scales, kpMaxByDay(kpForecast));
    expect(await upsertScales(t.db, rows)).toBe(5);
    expect(await upsertScales(t.db, [])).toBe(0);
    const today = rows.find((r) => r.kind === "predicted");
    if (today === undefined) throw new Error("fixture lacks a predicted row");
    const earlier = { ...today, issued: at("2026-10-24T12:00:00Z"), g: 4 };
    const newer = { ...today, issued: at("2026-10-25T06:00:00Z"), g: 2, rMinorProb: 25 };
    await upsertScales(t.db, [earlier]);
    let stored = await scalesBetween(t.db, today.day, today.day);
    expect(stored.find((r) => r.kind === "predicted")?.g).toBe(0);
    await upsertScales(t.db, [newer, { ...newer, g: 1 }]);
    stored = await scalesBetween(t.db, today.day, today.day);
    expect(stored.map((r) => r.kind)).toEqual(["observed", "predicted"]);
    expect(stored[1]).toMatchObject({ g: 1, rMinorProb: 25, issued: at("2026-10-25T06:00:00Z") });
    const all = await scalesBetween(t.db, at("2026-10-24T00:00:00Z"), at("2026-10-27T00:00:00Z"));
    expect(all).toHaveLength(5);
  });

  it("thins old fine rows to 5-minute means and leaves recent and on-grid rows alone", async () => {
    const old: SpaceSample[] = [];
    for (let m = 0; m < 12; m++) {
      old.push(sample("bz_gsm", `2026-09-01T00:${String(m).padStart(2, "0")}:00Z`, m, "SOLAR1"));
    }
    const recent = [sample("bz_gsm", "2026-10-25T03:01:00Z", 7, "SOLAR1")];
    const onGrid = [sample("dst", "2026-09-01T00:00:00Z", -20, "kyoto")];
    await upsertSamples(t.db, [...old, ...recent, ...onGrid]);
    const cutoff = at("2026-10-01T00:00:00Z");
    expect(await downsampleBefore(t.db, cutoff)).toEqual({ thinned: 3, deleted: 9 });
    const left = await samplesBetween(
      t.db,
      at("2026-09-01T00:00:00Z"),
      at("2026-09-01T01:00:00Z"),
      null,
    );
    expect(left.bz_gsm).toEqual([
      [at("2026-09-01T00:00:00Z").getTime(), 2],
      [at("2026-09-01T00:05:00Z").getTime(), 7],
      [at("2026-09-01T00:10:00Z").getTime(), 10.5],
    ]);
    expect(left.dst).toEqual([[at("2026-09-01T00:00:00Z").getTime(), -20]]);
    const kept = await samplesBetween(t.db, at("2026-10-25T00:00:00Z"), NOW, null);
    expect(kept.bz_gsm).toHaveLength(1);
    expect(await downsampleBefore(t.db, cutoff)).toEqual({ thinned: 0, deleted: 0 });
  });

  it("runs the jobs from the stub, skipping a failed file and failing only when every file fails", async () => {
    const log = recordingLogger();
    const ctx = { db: t.db, space: stubSpace(), log, now: () => NOW };
    const fast = await syncSpaceFast(ctx);
    expect(fast.failed).toEqual([]);
    expect(fast.written).toEqual({ aurora: 1, kp_1m: 6, mag: 6, wind: 6, xrays: 6, protons: 4 });
    const events = await syncSpaceEvents(ctx);
    expect(events.written).toEqual({ flares: 3, alerts: 4, scales: 5 });
    const slow = await syncSpaceSlow(ctx);
    expect(slow.written).toEqual({ kp_3h: 6, dst: 5 });
    expect(ctx.space.calls).toContain("fetchKpForecast");
    const latest = await latestReadings(t.db);
    expect(latest.xray_long?.source).toBe("GOES-18");
    expect(latest.speed?.value).toBeCloseTo(347.1, 3);
    expect(latest.hp_north).toMatchObject({
      time: new Date("2026-10-25T13:30:00Z"),
      source: "ovation",
      value: 20,
    });
    expect(latest.hp_south?.value).toBe(19);
    expect(log.entries.filter((e) => e.level === "info")).toHaveLength(3);

    const partial = {
      ...ctx,
      space: stubSpace({ fetchMag: new Error("mag down"), fetchKp1m: [] }),
      log: recordingLogger(),
    };
    const result = await syncSpaceFast(partial);
    expect(result.failed).toEqual(["mag"]);
    expect(result.written).toEqual({ aurora: 0, kp_1m: 0, wind: 6, xrays: 6, protons: 4 });
    expect(partial.log.entries[0]).toMatchObject({
      level: "warn",
      obj: { job: "space_fast", file: "mag" },
    });

    const dead = {
      ...ctx,
      space: stubSpace({ fetchKp3h: new Error("kp down"), fetchDst: new Error("dst down") }),
      log: recordingLogger(),
    };
    await expect(syncSpaceSlow(dead)).rejects.toThrow("kp_3h: kp down; dst: dst down");

    const pruneLog = recordingLogger();
    expect(await pruneSpace({ ...ctx, log: pruneLog })).toEqual({ thinned: 0, deleted: 0 });
    expect(pruneLog.entries[0]?.obj).toMatchObject({
      job: "space_prune",
      cutoff: new Date(NOW.getTime() - FINE_RETENTION_DAYS * 86_400_000),
    });
  });

  it("stores aurora frames once, lists and reads them, and prunes by observation time", async () => {
    const grid = new Uint8Array(AURORA_CELLS);
    grid[auroraIndex(180, 67)] = 42;
    grid[auroraIndex(359, -66)] = 7;
    const frameAt = (iso: string, over: Partial<AuroraFrame> = {}): AuroraFrame => ({
      observed: at(iso),
      forecast: at(iso.replace("T0", "T1")),
      powerNorth: 19.9,
      powerSouth: 19.2,
      grid,
      ...over,
    });
    expect(await insertAuroraFrame(t.db, frameAt("2026-10-25T03:50:00Z"))).toBe(1);
    expect(await insertAuroraFrame(t.db, frameAt("2026-10-25T03:50:00Z"))).toBe(0);
    expect(
      await insertAuroraFrame(
        t.db,
        frameAt("2026-10-25T03:55:00Z", { powerNorth: null, powerSouth: null }),
      ),
    ).toBe(1);
    expect(await insertAuroraFrame(t.db, frameAt("2026-10-21T03:55:00Z"))).toBe(1);

    const list = await auroraFrames(t.db, at("2026-10-22T04:00:00Z"));
    expect(list).toEqual([
      {
        observed: at("2026-10-25T03:50:00Z"),
        forecast: at("2026-10-25T13:50:00Z"),
        powerNorth: expect.closeTo(19.9, 4),
        powerSouth: expect.closeTo(19.2, 4),
      },
      {
        observed: at("2026-10-25T03:55:00Z"),
        forecast: at("2026-10-25T13:55:00Z"),
        powerNorth: null,
        powerSouth: null,
      },
    ]);
    const stored = await auroraFrame(t.db, at("2026-10-25T03:50:00Z"));
    expect(stored?.grid).toHaveLength(AURORA_CELLS);
    expect(stored?.grid[auroraIndex(180, 67)]).toBe(42);
    expect(stored?.grid[auroraIndex(359, -66)]).toBe(7);
    expect(stored?.grid[auroraIndex(0, 0)]).toBe(0);
    expect(await auroraFrame(t.db, at("2026-10-25T03:51:00Z"))).toBeNull();
    expect((await latestAuroraFrame(t.db))?.observed).toEqual(at("2026-10-25T03:55:00Z"));

    expect(await pruneAurora(t.db, at("2026-10-22T04:00:00Z"))).toBe(1);
    expect(await pruneAurora(t.db, at("2026-10-22T04:00:00Z"))).toBe(0);
    expect(await auroraFrames(t.db, at("2026-10-01T00:00:00Z"))).toHaveLength(2);
  });

  it("the aurora part stores the stub frame with its power, surviving a lost power file", async () => {
    const ctx = { db: t.db, space: stubSpace(), log: recordingLogger(), now: () => NOW };
    await syncSpaceFast(ctx);
    const stored = await latestAuroraFrame(t.db);
    expect(stored).toMatchObject({
      observed: at("2026-10-25T12:12:00Z"),
      forecast: at("2026-10-25T13:30:00Z"),
      powerNorth: 20,
      powerSouth: 19,
    });
    expect(stored?.grid[auroraIndex(180, 69)]).toBe(17);

    await t.truncate();
    const old = { ...aurora, "Observation Time": "2026-10-25T03:00:00Z" };
    const noPower = {
      ...ctx,
      space: stubSpace({ fetchAurora: old, fetchHemiPower: new Error("power down") }),
      log: recordingLogger(),
    };
    const result = await syncSpaceFast(noPower);
    expect(result.written.aurora).toBe(1);
    expect(result.failed).toEqual([]);
    expect(noPower.log.entries[0]).toMatchObject({
      level: "warn",
      obj: { job: "space_fast", file: "hemi_power" },
    });
    expect(await latestAuroraFrame(t.db)).toMatchObject({ powerNorth: null, powerSouth: null });

    // a later run prunes the frames past the 72-hour retention
    const late = { ...ctx, now: () => at("2026-10-28T03:30:00Z") };
    await syncSpaceFast(late);
    const left = await auroraFrames(t.db, at("2026-10-01T00:00:00Z"));
    expect(left.map((f) => f.observed)).toEqual([at("2026-10-25T12:12:00Z")]);
  });

  it("empty store answers empty aurora reads", async () => {
    expect(await auroraFrames(t.db, at("2026-10-01T00:00:00Z"))).toEqual([]);
    expect(await latestAuroraFrame(t.db)).toBeNull();
  });
});
