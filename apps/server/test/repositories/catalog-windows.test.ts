import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  coverageSpans,
  recordWindow,
  windowCovered,
  type WindowRecord,
} from "../../src/repositories/catalog-windows.js";
import { startRun } from "../../src/repositories/ingest-runs.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const d = (s: string) => new Date(s);
const JAN = { from: d("2020-01-01T00:00:00Z"), to: d("2020-02-01T00:00:00Z") };
const FEB = { from: d("2020-02-01T00:00:00Z"), to: d("2020-03-01T00:00:00Z") };
const APR = { from: d("2020-04-01T00:00:00Z"), to: d("2020-05-01T00:00:00Z") };
const WC = "-136,27,-104,53";

describe.skipIf(!docker)("catalog windows repository", () => {
  let t: TestDb;
  let runId: number;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
    runId = await startRun(t.db, "backfill");
  });

  const rec = (o: Partial<WindowRecord> = {}): WindowRecord => ({
    ...JAN,
    minMag: 2.5,
    bbox: null,
    events: 10,
    pages: 1,
    runId,
    completedAt: d("2026-10-17T00:00:00Z"),
    ...o,
  });

  it("covers a window by bounds, a floor at or below, and a global or equal bbox", async () => {
    await recordWindow(t.db, rec());
    expect(await windowCovered(t.db, { ...JAN, minMag: 2.5, bbox: null })).toBe(true);
    expect(await windowCovered(t.db, { ...JAN, minMag: 4.5, bbox: null })).toBe(true);
    expect(await windowCovered(t.db, { ...JAN, minMag: 2.5, bbox: WC })).toBe(true);
    expect(await windowCovered(t.db, { ...JAN, minMag: 1, bbox: null })).toBe(false);
    expect(await windowCovered(t.db, { ...JAN, minMag: null, bbox: null })).toBe(false);
    expect(await windowCovered(t.db, { ...FEB, minMag: 2.5, bbox: null })).toBe(false);
    await recordWindow(t.db, rec({ ...FEB, minMag: null, bbox: WC }));
    expect(await windowCovered(t.db, { ...FEB, minMag: null, bbox: WC })).toBe(true);
    expect(await windowCovered(t.db, { ...FEB, minMag: 3, bbox: WC })).toBe(true);
    expect(await windowCovered(t.db, { ...FEB, minMag: 3, bbox: null })).toBe(false);
    expect(await windowCovered(t.db, { ...FEB, minMag: 3, bbox: "0,0,1,1" })).toBe(false);
  });

  it("upserts on the key, including null scope columns", async () => {
    await recordWindow(t.db, rec());
    const later = await startRun(t.db, "backfill");
    await recordWindow(t.db, rec({ events: 12, pages: 2, runId: later }));
    const rows = await t.db.query.catalogWindows.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ events: 12, pages: 2, runId: later });
  });

  it("merges contiguous windows per scope into spans, oldest first", async () => {
    await recordWindow(t.db, rec({ ...FEB, events: 5 }));
    await recordWindow(t.db, rec());
    await recordWindow(t.db, rec({ ...APR, events: 7 }));
    await recordWindow(t.db, rec({ ...JAN, minMag: null, bbox: WC, events: 100 }));
    expect(await coverageSpans(t.db)).toEqual([
      { ...JAN, to: FEB.to, minMag: 2.5, bbox: null, events: 15, windows: 2 },
      { ...JAN, minMag: null, bbox: WC, events: 100, windows: 1 },
      { ...APR, minMag: 2.5, bbox: null, events: 7, windows: 1 },
    ]);
    await t.truncate();
    expect(await coverageSpans(t.db)).toEqual([]);
  });
});

if (!docker) {
  it("skipped: Docker is not reachable", () => {
    expect(true).toBe(true);
  });
}
