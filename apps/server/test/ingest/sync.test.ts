import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backfill } from "../../src/ingest/backfill.js";
import type { IngestContext } from "../../src/ingest/context.js";
import { syncDetails } from "../../src/ingest/details.js";
import { syncFeed } from "../../src/ingest/feed.js";
import { coverageSpans } from "../../src/repositories/catalog-windows.js";
import { getEvent, listEvents, upsertEvents } from "../../src/repositories/events.js";
import { getRun } from "../../src/repositories/ingest-runs.js";
import { upsertMechanism } from "../../src/repositories/mechanisms.js";
import { UsgsHttpError, type QueryParams } from "../../src/usgs/client.js";
import {
  detailDocumentSchema,
  feedDocumentSchema,
  type DetailDocument,
} from "../../src/usgs/schema.js";
import { makeEvent, makeMechanism } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";
import { loadFixture, recordingLogger } from "../support/fixtures.js";
import { stubUsgs, type StubOptions } from "../support/usgs-stub.js";

const docker = await dockerAvailable();
const feed = loadFixture("feed_day.json", feedDocumentSchema);
const detailUs = loadFixture("detail_us.json", detailDocumentSchema);
const detailNc = loadFixture("detail_nc.json", detailDocumentSchema);
const NOW = new Date("2026-10-13T12:00:00Z");

describe.skipIf(!docker)("ingest sync", () => {
  let t: TestDb;
  const ctx = (opts: StubOptions = {}) => {
    const usgs = stubUsgs(opts);
    const log = recordingLogger();
    const c: IngestContext = { db: t.db, usgs, log, now: () => NOW };
    return { ...c, usgs, log };
  };

  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
  });

  describe("syncDetails", () => {
    it("fetches candidates, stores mechanisms with preference, refreshes the event, stamps the check", async () => {
      await upsertEvents(t.db, [
        makeEvent({
          id: "nc75442207",
          types: ["moment-tensor", "focal-mechanism"],
          updated: new Date(0),
          mag: 1,
        }),
        makeEvent({ id: "plain", types: ["origin"] }),
      ]);
      const c = ctx({ details: { nc75442207: detailNc } });
      const r = await syncDetails(c);
      expect(r).toEqual({ candidates: 1, fetched: 1, failed: 0, mechanismsUpserted: 3 });
      expect(c.usgs.calls.detail).toEqual(["nc75442207"]);
      const e = await getEvent(t.db, "nc75442207");
      expect(e?.mag).toBe(detailNc.properties.mag);
      expect(e?.detailCheckedUpdated).toEqual(new Date(detailNc.properties.updated));
      expect(e?.mechanisms.map((m) => [m.kind, m.source, m.preferred]).sort()).toEqual(
        [
          ["fm", "nc", true],
          ["mt", "nc", true],
          ["mt", "us", false],
        ].sort(),
      );
      expect(await syncDetails(c)).toEqual({
        candidates: 0,
        fetched: 0,
        failed: 0,
        mechanismsUpserted: 0,
      });
    });

    it("deletes products reported as DELETE and keeps the rest", async () => {
      await upsertEvents(t.db, [makeEvent({ id: "us6000u1z5", types: ["moment-tensor"] })]);
      await upsertMechanism(
        t.db,
        makeMechanism({ eventId: "us6000u1z5", source: "zz", code: "gone" }),
      );
      const products = detailUs.properties.products ?? {};
      const doc: DetailDocument = {
        ...detailUs,
        properties: {
          ...detailUs.properties,
          products: {
            ...products,
            "moment-tensor": [
              ...(products["moment-tensor"] ?? []),
              { source: "zz", code: "gone", status: "DELETE", updateTime: 1, properties: {} },
            ],
          },
        },
      };
      await syncDetails(ctx({ details: { us6000u1z5: doc } }));
      const e = await getEvent(t.db, "us6000u1z5");
      expect(e?.mechanisms.map((m) => m.code)).toEqual(["us_6000u1z5_mww"]);
    });

    it("logs and skips a failing candidate, leaving it for next time, and respects limit and concurrency", async () => {
      await upsertEvents(t.db, [
        makeEvent({ id: "ok1", types: ["moment-tensor"], time: new Date("2026-10-12T03:00:00Z") }),
        makeEvent({ id: "bad", types: ["moment-tensor"], time: new Date("2026-10-12T02:00:00Z") }),
        makeEvent({
          id: "later",
          types: ["moment-tensor"],
          time: new Date("2026-10-12T01:00:00Z"),
        }),
      ]);
      const okDoc = { ...detailUs, id: "ok1" };
      const c = ctx({ details: { ok1: okDoc, bad: new Error("usgs down") } });
      const r = await syncDetails(c, { limit: 2, concurrency: 1 });
      expect(r).toEqual({ candidates: 2, fetched: 1, failed: 1, mechanismsUpserted: 1 });
      expect(c.usgs.calls.detail).toEqual(["ok1", "bad"]);
      expect(c.log.entries.find((e) => e.level === "warn")?.obj).toMatchObject({ eventId: "bad" });
      expect((await getEvent(t.db, "bad"))?.detailCheckedUpdated).toBeNull();
    });
  });

  describe("syncFeed", () => {
    it("loads the feed, runs details, and records an ok run", async () => {
      const c = ctx({ feeds: { "2.5_day": feed }, details: { us6000u1z5: detailUs } });
      const r = await syncFeed(c, "day");
      expect(r.events.inserted).toBe(feed.features.length);
      expect(r.details.fetched).toBeGreaterThanOrEqual(1);
      expect(c.usgs.calls.feed).toEqual(["2.5_day"]);
      const run = await getRun(t.db, r.runId);
      expect(run).toMatchObject({
        kind: "feed_day",
        ok: true,
        startedAt: NOW,
        finishedAt: NOW,
        eventsInserted: feed.features.length,
        detailsFetched: r.details.fetched,
        mechanismsUpserted: r.details.mechanismsUpserted,
        error: null,
      });
      expect(run?.detail).toMatchObject({ feed: "2.5_day" });
      expect(
        c.log.entries.some((e) => e.level === "info" && (e.msg ?? "").includes("complete")),
      ).toBe(true);
    });

    it("records a failed run and rethrows", async () => {
      const c = ctx({ feeds: { "2.5_week": new Error("503") } });
      await expect(syncFeed(c, "week")).rejects.toThrow("503");
      const runs = await t.db.query.ingestRuns.findMany();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ kind: "feed_week", ok: false, error: "503" });
    });
  });

  describe("backfill", () => {
    const featureAt = (id: string, time: string, mag = 3, types = "") => ({
      id,
      properties: { time: Date.parse(time), updated: Date.parse(time), mag, types },
      geometry: { coordinates: [0, 0, 10] },
    });
    const inWindow = (all: ReturnType<typeof featureAt>[]) => (p: QueryParams) => ({
      features: all
        .filter(
          (f) =>
            f.properties.time >= p.starttime.getTime() &&
            f.properties.time < p.endtime.getTime(),
        )
        .slice(0, p.limit),
    });
    const sleeps = () => {
      const calls: number[] = [];
      const sleep = (ms: number): Promise<void> => {
        calls.push(ms);
        return Promise.resolve();
      };
      return { calls, sleep };
    };
    const noSleep = (): Promise<void> => Promise.resolve();
    const FROM = new Date("2026-08-15T00:00:00Z");

    it("walks whole windows newest first, pages by cursor, freezes settled windows, and resumes", async () => {
      const all = [
        featureAt("aug1", "2026-08-02T00:00:00Z"),
        featureAt("aug2", "2026-08-03T00:00:00Z"),
        featureAt("aug3", "2026-08-04T00:00:00Z"),
        featureAt("sep1", "2026-09-10T00:00:00Z", 6, "moment-tensor"),
        featureAt("oct1", "2026-10-05T00:00:00Z", 4, "moment-tensor"),
      ];
      const s = sleeps();
      const c = ctx({
        query: inWindow(all),
        details: { sep1: { ...detailUs, id: "sep1" }, oct1: { ...detailUs, id: "oct1" } },
      });
      const r = await backfill(c, {
        from: FROM,
        to: NOW,
        minMagnitude: 2.5,
        pageLimit: 2,
        pauseMs: 7,
        sleep: s.sleep,
      });
      expect(r.windows).toEqual({ loaded: 3, skipped: 0, frozen: 1 });
      expect(r.events).toMatchObject({ inserted: 5 });
      expect(r.pages).toBe(5);
      expect(r.details.fetched).toBe(2);
      expect(c.usgs.calls.detail).toEqual(["sep1", "oct1"]);
      expect(c.usgs.calls.query.map((q) => q.starttime.toISOString())).toEqual([
        "2026-10-01T00:00:00.000Z",
        "2026-09-01T00:00:00.000Z",
        "2026-08-01T00:00:00.000Z",
        "2026-08-03T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
      ]);
      expect(c.usgs.calls.query[0]).toMatchObject({ minmagnitude: 2.5, limit: 2 });
      expect(c.usgs.calls.query[0]?.bbox).toBeUndefined();
      expect(s.calls).toEqual([7, 7, 7, 7, 7]);
      expect(await coverageSpans(t.db)).toEqual([
        {
          from: new Date("2026-08-01T00:00:00Z"),
          to: new Date("2026-09-01T00:00:00Z"),
          minMag: 2.5,
          bbox: null,
          events: 5,
          windows: 1,
        },
      ]);
      const run = await getRun(t.db, r.runId);
      expect(run).toMatchObject({
        kind: "backfill",
        ok: true,
        eventsInserted: 5,
        detailsFetched: 2,
      });
      expect(run?.detail).toMatchObject({
        from: FROM.toISOString(),
        minMagnitude: 2.5,
        bbox: null,
        windows: 3,
        windowsDone: 3,
        lastWindow: { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
      });

      const again = await backfill(c, { from: FROM, to: NOW, minMagnitude: 2.5, sleep: s.sleep });
      expect(again.windows).toEqual({ loaded: 2, skipped: 1, frozen: 0 });
      expect(c.log.entries.some((e) => e.msg === "window already complete; skipped")).toBe(true);
      const forced = await backfill(c, {
        from: FROM,
        to: NOW,
        minMagnitude: 2.5,
        force: true,
        sleep: s.sleep,
      });
      expect(forced.windows).toEqual({ loaded: 3, skipped: 0, frozen: 1 });
      expect((await t.db.query.catalogWindows.findMany())[0]?.runId).toBe(forced.runId);
    });

    it("passes an all-magnitude bbox scope through, skips details on request, and retries a 503", async () => {
      let failed = false;
      const s = sleeps();
      const all = [featureAt("w1", "2026-10-02T00:00:00Z", 1, "focal-mechanism")];
      const c = ctx({
        query: (p) => {
          if (!failed) {
            failed = true;
            throw new UsgsHttpError(503, "q");
          }
          return inWindow(all)(p);
        },
      });
      const bbox = { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 };
      const r = await backfill(c, {
        from: new Date("2026-10-01T00:00:00Z"),
        to: NOW,
        minMagnitude: null,
        bbox,
        skipDetails: true,
        pauseMs: 0,
        sleep: s.sleep,
      });
      expect(r.windows).toEqual({ loaded: 1, skipped: 0, frozen: 0 });
      expect(r.details).toEqual({ candidates: 0, fetched: 0, failed: 0, mechanismsUpserted: 0 });
      expect(c.usgs.calls.detail).toEqual([]);
      expect(c.usgs.calls.query).toHaveLength(2);
      expect(c.usgs.calls.query[1]?.minmagnitude).toBeUndefined();
      expect(c.usgs.calls.query[1]?.bbox).toEqual(bbox);
      expect(s.calls).toEqual([5000, 0]);
      expect((await getRun(t.db, r.runId))?.detail).toMatchObject({
        bbox: "-136,27,-104,53",
        minMagnitude: null,
        skipDetails: true,
      });
    });

    it("fails the run on a persistent error but keeps the windows already frozen", async () => {
      const c = ctx({
        query: (p) => {
          if (p.endtime.getTime() <= Date.parse("2026-08-01T00:00:00Z")) {
            throw new UsgsHttpError(400, "q");
          }
          return { features: [] };
        },
      });
      await expect(
        backfill(c, {
          from: new Date("2026-07-15T00:00:00Z"),
          to: NOW,
          minMagnitude: 2.5,
          sleep: noSleep,
        }),
      ).rejects.toThrow(/400/);
      const runs = await t.db.query.ingestRuns.findMany();
      expect(runs[0]).toMatchObject({ kind: "backfill", ok: false });
      expect(runs[0]?.detail).toMatchObject({
        windowsDone: 3,
        lastWindow: { from: "2026-08-01T00:00:00.000Z" },
      });
      expect((await coverageSpans(t.db)).map((span) => span.from.toISOString())).toEqual([
        "2026-08-01T00:00:00.000Z",
      ]);
    });

    it("stops a window when the cursor cannot advance", async () => {
      const same = "2026-10-13T00:00:00Z";
      const c = ctx({
        query: () => ({ features: [featureAt("s1", same), featureAt("s2", same)] }),
      });
      await expect(
        backfill(c, {
          from: new Date("2026-10-12T00:00:00Z"),
          to: NOW,
          minMagnitude: 2.5,
          pageLimit: 2,
          sleep: noSleep,
        }),
      ).rejects.toThrow(/cursor/);
    });

    it("stops the detail loop when every candidate fails", async () => {
      const c = ctx({
        query: () => ({
          features: [featureAt("f1", "2026-10-12T00:00:00Z", 5, "moment-tensor")],
        }),
        details: { f1: new Error("down") },
      });
      const r = await backfill(c, {
        from: new Date("2026-10-12T00:00:00Z"),
        to: NOW,
        minMagnitude: 2.5,
        sleep: noSleep,
      });
      expect(r.details).toEqual({ candidates: 1, fetched: 0, failed: 1, mechanismsUpserted: 0 });
    });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
