import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  catalogStats,
  getEvent,
  listEventsWithPreferred,
  upsertEvents,
} from "../../src/repositories/events.js";
import {
  finishRun,
  lastSuccessfulFeedAt,
  latestRuns,
  listRuns,
  startRun,
} from "../../src/repositories/ingest-runs.js";
import { listPreferredMechanisms, upsertMechanism } from "../../src/repositories/mechanisms.js";
import { makeEvent, makeMechanism } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("API repository reads", () => {
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

  async function seedCatalog(): Promise<void> {
    await upsertEvents(t.db, [
      makeEvent({ id: "a", time: new Date("2026-10-12T00:00:00Z") }),
      makeEvent({ id: "b", time: new Date("2026-10-10T00:00:00Z") }),
      makeEvent({ id: "c", time: new Date("2026-10-11T00:00:00Z") }),
    ]);
    await upsertMechanism(
      t.db,
      makeMechanism({ eventId: "a", kind: "mt", source: "us", code: "m1" }),
    );
    await upsertMechanism(
      t.db,
      makeMechanism({ eventId: "a", kind: "mt", source: "nc", code: "m2", preferred: false }),
    );
    await upsertMechanism(
      t.db,
      makeMechanism({ eventId: "a", kind: "fm", source: "nc", code: "f1" }),
    );
    await upsertMechanism(
      t.db,
      makeMechanism({ eventId: "b", kind: "mt", source: "us", code: "m3", preferred: false }),
    );
  }

  it("listPreferredMechanisms returns only preferred rows for the given ids, and nothing for no ids", async () => {
    await seedCatalog();
    expect(await listPreferredMechanisms(t.db, [])).toEqual([]);
    const rows = await listPreferredMechanisms(t.db, ["a", "b"]);
    expect(rows.map((m) => [m.eventId, m.kind, m.code])).toEqual([
      ["a", "fm", "f1"],
      ["a", "mt", "m1"],
    ]);
  });

  it("listEventsWithPreferred attaches preferred mechanisms per event", async () => {
    await seedCatalog();
    const rows = await listEventsWithPreferred(t.db, { since: new Date("2026-10-01T00:00:00Z") });
    expect(rows.map((e) => [e.id, e.mechanisms.map((m) => m.code)])).toEqual([
      ["a", ["f1", "m1"]],
      ["c", []],
      ["b", []],
    ]);
  });

  it("getEvent orders mechanisms by kind, preferred first, then source and code", async () => {
    await seedCatalog();
    const e = await getEvent(t.db, "a");
    expect(e?.mechanisms.map((m) => m.code)).toEqual(["f1", "m1", "m2"]);
  });

  it("catalogStats counts events and mechanisms, with nulls on an empty catalog", async () => {
    expect(await catalogStats(t.db)).toEqual({
      events: { total: 0, newest: null, oldest: null, withMechanism: 0 },
      mechanisms: { total: 0 },
    });
    await seedCatalog();
    expect(await catalogStats(t.db)).toEqual({
      events: {
        total: 3,
        newest: new Date("2026-10-12T00:00:00Z"),
        oldest: new Date("2026-10-10T00:00:00Z"),
        withMechanism: 2,
      },
      mechanisms: { total: 4 },
    });
  });

  it("run reads: list newest first with filters, latest per kind, last successful feed", async () => {
    const t1 = new Date("2026-10-13T01:00:00Z");
    const t2 = new Date("2026-10-13T02:00:00Z");
    const t3 = new Date("2026-10-13T03:00:00Z");
    const r1 = await startRun(t.db, "feed_day", {}, t1);
    await finishRun(t.db, r1, { ok: true }, t1);
    const r2 = await startRun(t.db, "feed_day", {}, t2);
    await finishRun(t.db, r2, { ok: false, error: "503" }, t2);
    const r3 = await startRun(t.db, "backfill", { days: 1 }, t3);
    await finishRun(t.db, r3, { ok: true }, t3);

    expect((await listRuns(t.db)).map((r) => r.id)).toEqual([r3, r2, r1]);
    expect((await listRuns(t.db, { kind: "feed_day", limit: 1 })).map((r) => r.id)).toEqual([r2]);

    const latest = await latestRuns(t.db);
    expect(latest.feed_day?.id).toBe(r2);
    expect(latest.backfill?.id).toBe(r3);
    expect(latest.feed_week).toBeNull();
    expect(latest.details).toBeNull();

    expect(await lastSuccessfulFeedAt(t.db)).toEqual(t1);
  });

  it("lastSuccessfulFeedAt is null without a successful feed run", async () => {
    expect(await lastSuccessfulFeedAt(t.db)).toBeNull();
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
