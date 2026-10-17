import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  finishRun,
  getRun,
  startRun,
  updateRunDetail,
} from "../../src/repositories/ingest-runs.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("ingest runs repository", () => {
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

  it("updateRunDetail replaces the detail document", async () => {
    const id = await startRun(t.db, "backfill", { a: 1 });
    await updateRunDetail(t.db, id, { b: 2 });
    expect((await getRun(t.db, id))?.detail).toEqual({ b: 2 });
  });

  it("records a successful run with counts", async () => {
    const started = new Date("2026-10-13T00:00:00Z");
    const id = await startRun(t.db, "feed_day", { url: "x" }, started);
    expect(await getRun(t.db, id)).toMatchObject({
      kind: "feed_day",
      startedAt: started,
      finishedAt: null,
      ok: null,
      detail: { url: "x" },
    });
    const finished = new Date("2026-10-13T00:00:05Z");
    await finishRun(
      t.db,
      id,
      {
        ok: true,
        eventsInserted: 3,
        eventsUpdated: 2,
        eventsSkipped: 1,
        detailsFetched: 4,
        mechanismsUpserted: 5,
      },
      finished,
    );
    expect(await getRun(t.db, id)).toMatchObject({
      ok: true,
      finishedAt: finished,
      error: null,
      eventsInserted: 3,
      eventsUpdated: 2,
      eventsSkipped: 1,
      detailsFetched: 4,
      mechanismsUpserted: 5,
    });
  });

  it("records a failed run with its error and zeroed counts, using defaults for times", async () => {
    const id = await startRun(t.db, "backfill");
    await finishRun(t.db, id, { ok: false, error: "boom" });
    const run = await getRun(t.db, id);
    expect(run).toMatchObject({
      ok: false,
      error: "boom",
      eventsInserted: 0,
      mechanismsUpserted: 0,
      detail: {},
    });
    expect(run?.startedAt).toBeInstanceOf(Date);
    expect(run?.finishedAt).toBeInstanceOf(Date);
  });

  it("returns null for an unknown run", async () => {
    expect(await getRun(t.db, 999)).toBeNull();
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
