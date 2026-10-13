import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backfill } from "../../src/ingest/backfill.js";
import type { IngestContext } from "../../src/ingest/context.js";
import { syncDetails } from "../../src/ingest/details.js";
import { syncFeed } from "../../src/ingest/feed.js";
import { getEvent, listEvents, upsertEvents } from "../../src/repositories/events.js";
import { getRun } from "../../src/repositories/ingest-runs.js";
import { upsertMechanism } from "../../src/repositories/mechanisms.js";
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
    const featureAt = (id: string, time: Date, types = "") => ({
      id,
      properties: { time: time.getTime(), updated: time.getTime(), mag: 3, types },
      geometry: { coordinates: [0, 0, 10] },
    });

    it("pages by cursor inside each window and runs details until drained", async () => {
      const t0 = new Date("2026-10-01T00:00:00Z");
      const all = Array.from({ length: 5 }, (_, i) =>
        featureAt(
          `b${String(i)}`,
          new Date(t0.getTime() + i * 3_600_000),
          i === 4 ? "moment-tensor" : "",
        ),
      );
      const c = ctx({
        query: (p) => ({
          features: all
            .filter(
              (f) =>
                f.properties.time >= p.starttime.getTime() &&
                f.properties.time < p.endtime.getTime(),
            )
            .slice(0, p.limit),
        }),
        details: { b4: { ...detailUs, id: "b4" } },
      });
      const r = await backfill(c, { days: 20, windowDays: 10, pageLimit: 2 });
      expect(r.events.inserted).toBe(5);
      expect(r.details.fetched).toBe(1);
      expect(r.pages).toBeGreaterThanOrEqual(4);
      expect((await listEvents(t.db)).map((e) => e.id).sort()).toEqual([
        "b0",
        "b1",
        "b2",
        "b3",
        "b4",
      ]);
      expect(c.usgs.calls.query[0]?.starttime.toISOString()).toBe("2026-09-23T12:00:00.000Z");
      expect(c.usgs.calls.query.every((q) => q.limit === 2 && q.minmagnitude === 2.5)).toBe(true);
      const run = await getRun(t.db, r.runId);
      expect(run).toMatchObject({
        kind: "backfill",
        ok: true,
        eventsInserted: 5,
        detailsFetched: 1,
      });
      expect(run?.detail).toMatchObject({ days: 20, windowDays: 10 });
    });

    it("stops a window when the cursor cannot advance", async () => {
      const same = new Date("2026-10-13T00:00:00Z");
      const c = ctx({
        query: () => ({ features: [featureAt("s1", same), featureAt("s2", same)] }),
      });
      await expect(backfill(c, { days: 1, pageLimit: 2 })).rejects.toThrow(/cursor/);
      const runs = await t.db.query.ingestRuns.findMany();
      expect(runs[0]).toMatchObject({ kind: "backfill", ok: false });
    });

    it("stops the detail loop when every candidate fails", async () => {
      const c = ctx({
        query: () => ({
          features: [featureAt("f1", new Date("2026-10-12T00:00:00Z"), "moment-tensor")],
        }),
        details: { f1: new Error("down") },
      });
      const r = await backfill(c, { days: 2 });
      expect(r.details).toEqual({ candidates: 1, fetched: 0, failed: 1, mechanismsUpserted: 0 });
    });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
