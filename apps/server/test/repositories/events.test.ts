import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getEvent,
  listDetailCandidates,
  listEvents,
  markDetailChecked,
  upsertEvents,
} from "../../src/repositories/events.js";
import { makeEvent } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("events repository", () => {
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

  it("returns zero counts for an empty batch", async () => {
    expect(await upsertEvents(t.db, [])).toEqual({ inserted: 0, updated: 0, skipped: 0 });
  });

  it("inserts new events and reads them back with bookkeeping", async () => {
    const e = makeEvent();
    expect(await upsertEvents(t.db, [e])).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    const got = await getEvent(t.db, e.id);
    expect(got).toMatchObject({ ...e, mechanisms: [] });
    expect(got?.firstSeen).toBeInstanceOf(Date);
    expect(got?.lastSeen).toBeInstanceOf(Date);
  });

  it("returns null for an unknown id", async () => {
    expect(await getEvent(t.db, "nope")).toBeNull();
  });

  it("updates when the incoming revision is newer or equal, skips when older", async () => {
    const e = makeEvent({ updated: new Date("2026-10-12T06:00:00Z"), mag: 5.5 });
    await upsertEvents(t.db, [e]);

    const newer = { ...e, updated: new Date("2026-10-12T07:00:00Z"), mag: 5.6 };
    expect(await upsertEvents(t.db, [newer])).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect((await getEvent(t.db, e.id))?.mag).toBe(5.6);

    const same = { ...newer, mag: 5.7 };
    expect(await upsertEvents(t.db, [same])).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect((await getEvent(t.db, e.id))?.mag).toBe(5.7);

    const older = { ...e, mag: 9.9 };
    expect(await upsertEvents(t.db, [older])).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect((await getEvent(t.db, e.id))?.mag).toBe(5.7);
  });

  it("bumps last_seen even when the revision is skipped, keeps first_seen", async () => {
    const e = makeEvent();
    await upsertEvents(t.db, [e]);
    await t.db.execute(
      sql`update events set last_seen = last_seen - interval '1 hour', first_seen = first_seen - interval '1 hour'`,
    );
    const aged = await getEvent(t.db, e.id);
    await upsertEvents(t.db, [{ ...e, updated: new Date(e.updated.getTime() - 1000) }]);
    const after = await getEvent(t.db, e.id);
    expect(after?.lastSeen.getTime()).toBeGreaterThan(aged?.lastSeen.getTime() ?? 0);
    expect(after?.firstSeen.getTime()).toBe(aged?.firstSeen.getTime());
  });

  it("deduplicates a batch by id, keeping the latest revision", async () => {
    const a = makeEvent({ updated: new Date("2026-10-12T06:00:00Z"), mag: 5.0 });
    const b = { ...a, updated: new Date("2026-10-12T06:30:00Z"), mag: 5.2 };
    expect(await upsertEvents(t.db, [b, a])).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    expect((await getEvent(t.db, a.id))?.mag).toBe(5.2);
  });

  it("handles batches larger than one chunk", async () => {
    const many = Array.from({ length: 1203 }, (_, i) => makeEvent({ id: `ev${String(i)}` }));
    expect(await upsertEvents(t.db, many)).toEqual({ inserted: 1203, updated: 0, skipped: 0 });
    expect((await listEvents(t.db, { limit: 5000 })).length).toBe(1203);
  });

  describe("listEvents", () => {
    beforeEach(async () => {
      await upsertEvents(t.db, [
        makeEvent({
          id: "a",
          time: new Date("2026-10-10T00:00:00Z"),
          mag: 4.5,
          latitude: 40,
          longitude: -120,
        }),
        makeEvent({
          id: "b",
          time: new Date("2026-10-11T00:00:00Z"),
          mag: 5.5,
          latitude: 10,
          longitude: 100,
        }),
        makeEvent({
          id: "c",
          time: new Date("2026-10-12T00:00:00Z"),
          mag: 6.5,
          latitude: -18,
          longitude: 179.5,
        }),
        makeEvent({
          id: "d",
          time: new Date("2026-10-12T01:00:00Z"),
          mag: null,
          latitude: -18,
          longitude: -179.5,
        }),
      ]);
    });

    it("orders by time descending with default limit", async () => {
      expect((await listEvents(t.db)).map((e) => e.id)).toEqual(["d", "c", "b", "a"]);
    });

    it("filters by since and until inclusively", async () => {
      const r = await listEvents(t.db, {
        since: new Date("2026-10-11T00:00:00Z"),
        until: new Date("2026-10-12T00:00:00Z"),
      });
      expect(r.map((e) => e.id)).toEqual(["c", "b"]);
    });

    it("filters by minMag and excludes null magnitudes", async () => {
      expect((await listEvents(t.db, { minMag: 5.5 })).map((e) => e.id)).toEqual(["c", "b"]);
    });

    it("filters by a plain bbox", async () => {
      const r = await listEvents(t.db, {
        bbox: { minLat: 27, maxLat: 53, minLon: -136, maxLon: -104 },
      });
      expect(r.map((e) => e.id)).toEqual(["a"]);
    });

    it("filters by a bbox that crosses the antimeridian", async () => {
      const r = await listEvents(t.db, {
        bbox: { minLat: -30, maxLat: 0, minLon: 170, maxLon: -170 },
      });
      expect(r.map((e) => e.id)).toEqual(["d", "c"]);
    });

    it("clamps limit to the maximum and rejects non-positive values", async () => {
      expect((await listEvents(t.db, { limit: 2 })).length).toBe(2);
      expect((await listEvents(t.db, { limit: 99999 })).length).toBe(4);
      await expect(listEvents(t.db, { limit: 0 })).rejects.toThrow(/limit/);
    });
  });

  describe("detail candidates", () => {
    it("selects events advertising a mechanism that were never checked or were revised since", async () => {
      const updated = new Date("2026-10-12T06:00:00Z");
      await upsertEvents(t.db, [
        makeEvent({
          id: "mt-new",
          types: ["origin", "moment-tensor"],
          time: new Date("2026-10-12T03:00:00Z"),
        }),
        makeEvent({
          id: "fm-new",
          types: ["focal-mechanism"],
          time: new Date("2026-10-12T02:00:00Z"),
        }),
        makeEvent({ id: "plain", types: ["origin"], time: new Date("2026-10-12T04:00:00Z") }),
        makeEvent({ id: "checked", types: ["moment-tensor"], updated }),
        makeEvent({
          id: "revised",
          types: ["moment-tensor"],
          updated,
          time: new Date("2026-10-12T01:00:00Z"),
        }),
      ]);
      await markDetailChecked(t.db, "checked", updated);
      await markDetailChecked(t.db, "revised", new Date("2026-10-12T05:00:00Z"));
      const ids = (await listDetailCandidates(t.db, 10)).map((c) => c.id);
      expect(ids).toEqual(["mt-new", "fm-new", "revised"]);
      expect((await listDetailCandidates(t.db, 1)).map((c) => c.id)).toEqual(["mt-new"]);
      expect((await getEvent(t.db, "checked"))?.detailCheckedUpdated).toEqual(updated);
    });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
