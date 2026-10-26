import {
  AURORA_CELLS,
  auroraIndex,
  type ApiAuroraFrame,
  type ApiAuroraIndex,
  type ApiError,
  type ApiSpaceNow,
  type ApiSpaceWindow,
} from "@tectonic/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { bucketFor } from "../../src/api/schemas.js";
import { syncSpaceEvents, syncSpaceFast, syncSpaceSlow } from "../../src/ingest/space.js";
import { insertAuroraFrame, upsertSamples } from "../../src/repositories/space.js";
import { utcDay } from "../../src/routes/space.js";
import { recordingLogger } from "../support/fixtures.js";
import { stubSpace } from "../support/space-stub.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const NOW = new Date("2026-10-25T04:00:00Z");

describe("bucketFor", () => {
  it("serves up to 25 hours raw and thins longer windows to 1,500 points on whole minutes", () => {
    const from = new Date("2026-10-01T00:00:00Z");
    expect(bucketFor(from, new Date("2026-10-02T01:00:00Z"))).toBeNull();
    expect(bucketFor(from, new Date("2026-10-02T01:00:01Z"))).toBe(120);
    expect(bucketFor(from, new Date("2026-10-08T00:00:00Z"))).toBe(420);
    expect(bucketFor(from, new Date("2026-10-31T00:00:00Z"))).toBe(1740);
    expect(utcDay(new Date("2026-10-25T23:59:59Z")).toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });
});

describe.skipIf(!docker)("space routes", () => {
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

  const inject = (url: string) => app.inject({ method: "GET", url });
  const seed = async (): Promise<void> => {
    const ctx = { db: t.db, space: stubSpace(), log: recordingLogger(), now: () => NOW };
    await Promise.all([syncSpaceFast(ctx), syncSpaceEvents(ctx), syncSpaceSlow(ctx)]);
  };

  it("answers the latest readings, the scales around today and the newest events, cached a minute", async () => {
    await seed();
    const res = await inject("/api/space/now");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    const body = res.json<ApiSpaceNow>();
    expect(body.generatedAt).toBe("2026-10-25T04:00:00.000Z");
    expect(body.latest.kp_1m).toEqual({
      time: "2026-10-25T03:44:00.000Z",
      value: 0,
      source: "swpc",
    });
    expect(body.latest.speed).toMatchObject({ time: "2026-10-25T03:41:00.000Z", source: "SOLAR1" });
    expect(body.latest.xray_long?.source).toBe("GOES-18");
    expect(body.latest.dst).toEqual({
      time: "2026-10-25T03:00:00.000Z",
      value: 7,
      source: "kyoto",
    });
    expect(body.latest.hp_north).toEqual({
      time: "2026-10-25T13:30:00.000Z",
      value: 20,
      source: "ovation",
    });
    expect(body.scales.map((s) => [s.day.slice(0, 10), s.kind])).toEqual([
      ["2026-10-24", "observed"],
      ["2026-10-25", "observed"],
      ["2026-10-25", "predicted"],
      ["2026-10-26", "predicted"],
      ["2026-10-27", "predicted"],
    ]);
    expect(body.scales[2]).toMatchObject({
      rMinorProb: 10,
      rMajorProb: 1,
      sProb: 1,
      g: 0,
      kpMax: 4,
    });
    expect(body.latestFlare).toMatchObject({
      beginTime: "2026-10-24T21:38:00.000Z",
      endTime: null,
    });
    expect(body.latestAlert).toMatchObject({
      productId: "EF3A",
      issueTime: "2026-10-24T09:04:23.307Z",
    });
  });

  it("answers an empty store with nulls and empty lists", async () => {
    const now = (await inject("/api/space/now")).json<ApiSpaceNow>();
    expect(now.latest.kp_1m).toBeNull();
    expect(now.scales).toEqual([]);
    expect(now.latestFlare).toBeNull();
    expect(now.latestAlert).toBeNull();
    const win = (
      await inject("/api/space/window?from=2026-10-24T00:00:00Z")
    ).json<ApiSpaceWindow>();
    expect(win.samples.speed).toEqual([]);
    expect(win.flares).toEqual([]);
    expect(win.alerts).toEqual([]);
    expect(win.scales).toEqual([]);
    expect(win.to).toBe("2026-10-25T04:00:00.000Z");
  });

  it("returns a short window raw with its flares, alerts and scales", async () => {
    await seed();
    const res = await inject("/api/space/window?from=2026-10-24T00:00:00Z&to=2026-10-25T01:00:00Z");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    const body = res.json<ApiSpaceWindow>();
    expect(body).toMatchObject({
      from: "2026-10-24T00:00:00.000Z",
      to: "2026-10-25T01:00:00.000Z",
      bucketSeconds: null,
    });
    expect(body.samples.kp_3h).toEqual([
      [Date.parse("2026-10-24T09:00:00Z"), 2],
      [Date.parse("2026-10-24T12:00:00Z"), 1.67],
      [Date.parse("2026-10-24T15:00:00Z"), 1.67],
      [Date.parse("2026-10-24T18:00:00Z"), 1.67],
      [Date.parse("2026-10-24T21:00:00Z"), 0.67],
      [Date.parse("2026-10-25T00:00:00Z"), 0.67],
    ]);
    expect(body.samples.dst.map((p) => p[1])).toEqual([9, 12, 14]);
    expect(body.samples.speed).toEqual([]);
    expect(body.flares.map((f) => f.maxClass)).toEqual(["B7.5", "C1.0", "B5.2"]);
    expect(body.alerts.map((a) => a.productId)).toEqual(["EF3A"]);
    expect(body.scales.map((s) => [s.day.slice(0, 10), s.kind])).toEqual([
      ["2026-10-24", "observed"],
      ["2026-10-25", "observed"],
      ["2026-10-25", "predicted"],
    ]);
  });

  it("thins a long window to one bucket for every series", async () => {
    const rows = [];
    for (let m = 0; m < 30; m++) {
      rows.push({
        series: "bt" as const,
        time: new Date(Date.UTC(2026, 9, 20, 0, m)),
        source: "SOLAR1",
        value: 5 + m,
      });
    }
    await upsertSamples(t.db, rows);
    const body = (
      await inject("/api/space/window?from=2026-10-18T04:00:00Z&to=2026-10-25T04:00:00Z")
    ).json<ApiSpaceWindow>();
    expect(body.bucketSeconds).toBe(420);
    // 30 one-minute rows fall into five 7-minute buckets from the 2000-01-01 epoch
    expect(body.samples.bt).toHaveLength(5);
    expect(body.samples.bt[0]?.[1]).toBeCloseTo(7.5, 6);
    expect(body.samples.bt.every((p, i, a) => i === 0 || p[0] > (a[i - 1]?.[0] ?? 0))).toBe(true);
  });

  it("lists the stored aurora frames and serves one with its grid", async () => {
    expect((await inject("/api/space/aurora")).json<ApiAuroraIndex>()).toEqual({
      generatedAt: "2026-10-25T04:00:00.000Z",
      frames: [],
    });
    const grid = new Uint8Array(AURORA_CELLS);
    grid[auroraIndex(180, 67)] = 42;
    const base = {
      forecast: new Date("2026-10-25T04:30:00Z"),
      powerNorth: 19.5,
      powerSouth: null,
      grid,
    };
    await insertAuroraFrame(t.db, { ...base, observed: new Date("2026-10-25T03:50:00Z") });
    await insertAuroraFrame(t.db, { ...base, observed: new Date("2026-10-25T03:45:00Z") });
    // past the 72-hour retention: stored but not listed
    await insertAuroraFrame(t.db, { ...base, observed: new Date("2026-10-21T03:50:00Z") });

    const index = await inject("/api/space/aurora");
    expect(index.headers["cache-control"]).toBe("public, max-age=60");
    expect(index.json<ApiAuroraIndex>().frames).toEqual([
      {
        observed: "2026-10-25T03:45:00.000Z",
        forecast: "2026-10-25T04:30:00.000Z",
        powerNorth: 19.5,
        powerSouth: null,
      },
      {
        observed: "2026-10-25T03:50:00.000Z",
        forecast: "2026-10-25T04:30:00.000Z",
        powerNorth: 19.5,
        powerSouth: null,
      },
    ]);

    const res = await inject("/api/space/aurora/2026-10-25T03:50:00.000Z");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    const frame = res.json<ApiAuroraFrame>();
    expect(frame).toMatchObject({ observed: "2026-10-25T03:50:00.000Z", powerNorth: 19.5 });
    const bytes = Buffer.from(frame.grid, "base64");
    expect(bytes).toHaveLength(AURORA_CELLS);
    expect(bytes[auroraIndex(180, 67)]).toBe(42);
    expect(bytes[auroraIndex(0, 0)]).toBe(0);
    expect((await inject("/api/space/aurora/2026-10-25T03:50:00Z")).statusCode).toBe(200);

    const missing = await inject("/api/space/aurora/2026-10-25T03:51:00Z");
    expect(missing.statusCode).toBe(404);
    expect(missing.json<ApiError>().error).toBe("aurora frame not found");
    const bad = await inject("/api/space/aurora/yesterday");
    expect(bad.statusCode).toBe(400);
    expect(bad.json<ApiError>().issues?.[0]?.path).toBe("observed");
  });

  it("rejects a missing or malformed from, a reversed range, a span over 93 days and unknown keys", async () => {
    for (const [url, path] of [
      ["/api/space/window", "from"],
      ["/api/space/window?from=yesterday", "from"],
      ["/api/space/window?from=2026-10-25T05:00:00Z", "to"],
      ["/api/space/window?from=2026-10-20T00:00:00Z&to=2026-10-19T00:00:00Z", "to"],
      ["/api/space/window?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z", "to"],
      ["/api/space/window?from=2026-10-24T00:00:00Z&n=3", ""],
    ] as const) {
      const res = await inject(url);
      expect(res.statusCode, url).toBe(400);
      const body = res.json<ApiError>();
      expect(body.error).toBe("invalid request");
      expect(body.issues?.[0]?.path, url).toBe(path);
    }
  });
});
