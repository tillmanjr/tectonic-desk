import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillSpaceHistory,
  HISTORY_CHUNK_YEARS,
  HISTORY_REFRESH_DAYS,
  HISTORY_START,
  historyChunks,
  syncSpaceHistory,
} from "../../src/ingest/space-history.js";
import type { SpaceContext } from "../../src/ingest/space.js";
import {
  latestReadings,
  preliminaryKpFrom,
  samplesBetween,
  upsertSamples,
} from "../../src/repositories/space.js";
import { SpaceHttpError } from "../../src/space/client.js";
import { recordingLogger } from "../support/fixtures.js";
import { gfzRaw, stubHistory, type StubHistory } from "../support/history-stub.js";
import { stubSpace } from "../support/space-stub.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();
const NOW = new Date("2026-10-26T04:00:00Z");
const at = (iso: string): Date => new Date(iso);

describe("historyChunks", () => {
  it("walks ten calendar years at a time, newest first, clipped to the range", () => {
    expect(HISTORY_CHUNK_YEARS).toBe(10);
    expect(HISTORY_START).toEqual(at("1932-01-01T00:00:00Z"));
    const chunks = historyChunks(HISTORY_START, NOW);
    expect(chunks).toHaveLength(10);
    expect(chunks[0]).toEqual({ from: at("2017-01-01T00:00:00Z"), to: NOW });
    expect(chunks[1]).toEqual({ from: at("2007-01-01T00:00:00Z"), to: at("2016-12-31T23:59:59Z") });
    expect(chunks[8]).toEqual({ from: at("1937-01-01T00:00:00Z"), to: at("1946-12-31T23:59:59Z") });
    expect(chunks[9]).toEqual({ from: at("1932-01-01T00:00:00Z"), to: at("1936-12-31T23:59:59Z") });
    expect(historyChunks(at("2026-10-01T00:00:00Z"), NOW)).toEqual([
      { from: at("2026-10-01T00:00:00Z"), to: NOW },
    ]);
    expect(historyChunks(NOW, NOW)).toEqual([]);
  });
});

describe.skipIf(!docker)("space history job and backfill", () => {
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

  const context = (
    history: StubHistory,
    log = recordingLogger(),
  ): SpaceContext & { history: StubHistory } => ({
    db: t.db,
    space: stubSpace(),
    history,
    log,
    now: () => NOW,
  });

  it("rewrites the last sixty days from every source and drops superseded preliminary Kp", async () => {
    // a stale preliminary row at an hour the fixture now reports as definitive
    await upsertSamples(t.db, [
      { series: "kp_gfz", time: at("2026-09-30T21:00:00Z"), source: "gfz-pre", value: 9 },
    ]);
    const ctx = context(stubHistory());
    const r = await syncSpaceHistory(ctx);
    expect(r).toEqual({
      written: { gfz_Kp: 15, gfz_Ap: 3, gfz_SN: 3, gfz_Fobs: 3, dst: 9 },
      failed: [],
    });
    expect(ctx.history.calls.sort()).toEqual(["dst", "gfz:Ap", "gfz:Fobs", "gfz:Kp", "gfz:SN"]);
    const from = new Date(NOW.getTime() - HISTORY_REFRESH_DAYS * 86_400_000);
    expect(ctx.history.ranges.every(([a, b]) => a.getTime() === from.getTime() && b === NOW)).toBe(
      true,
    );
    expect(await preliminaryKpFrom(t.db)).toEqual(at("2026-10-01T00:00:00Z"));
    const pts = await samplesBetween(
      t.db,
      at("2026-09-30T21:00:00Z"),
      at("2026-09-30T21:00:00Z"),
      null,
    );
    expect(pts.kp_gfz).toEqual([[at("2026-09-30T21:00:00Z").getTime(), 0.333]]);
    const latest = await latestReadings(t.db);
    expect(latest.f107).toMatchObject({ value: 92.4, source: "gfz" });
    expect(latest.ssn).toMatchObject({ value: 27, source: "gfz" });
    expect(latest.ap).toMatchObject({ value: 3, time: at("2026-10-01T00:00:00Z") });
    expect(latest.dst).toMatchObject({
      value: 3,
      source: "kyoto",
      time: at("2026-10-25T04:00:00Z"),
    });
  });

  it("keeps the GFZ parts when Kyoto fails", async () => {
    const log = recordingLogger();
    const ctx = context(stubHistory({ fetchDst: new Error("kyoto down") }), log);
    const r = await syncSpaceHistory(ctx);
    expect(r.failed).toEqual(["dst"]);
    expect(r.written).toEqual({ gfz_Kp: 15, gfz_Ap: 3, gfz_SN: 3, gfz_Fobs: 3 });
    expect(
      log.entries.some((e) => e.level === "warn" && e.msg === "space weather file failed"),
    ).toBe(true);
  });

  it("backfills chunk by chunk, newest first, and sums the rows per series", async () => {
    const log = recordingLogger();
    const ctx = context(stubHistory(), log);
    const r = await backfillSpaceHistory(ctx, { from: at("2010-01-01T00:00:00Z"), to: NOW });
    expect(r.chunks).toBe(2);
    expect(r.superseded).toBe(0);
    // the same fixture answers both chunks, so every count is doubled
    expect(r.written).toMatchObject({ kp_gfz: 30, ap: 6, ssn: 6, f107: 6, dst: 18, kp_1m: 0 });
    expect(ctx.history.calls).toEqual([
      "gfz:Kp",
      "gfz:Ap",
      "gfz:SN",
      "gfz:Fobs",
      "dst",
      "gfz:Kp",
      "gfz:Ap",
      "gfz:SN",
      "gfz:Fobs",
      "dst",
    ]);
    expect(ctx.history.ranges[0]).toEqual([at("2017-01-01T00:00:00Z"), NOW]);
    expect(ctx.history.ranges[5]).toEqual([at("2010-01-01T00:00:00Z"), at("2016-12-31T23:59:59Z")]);
    expect(log.entries.filter((e) => e.msg === "space history chunk loaded")).toHaveLength(2);
  });

  it("retries a request the service refused and gives up on a client error", async () => {
    let failures = 1;
    const flaky = stubHistory({
      fetchGfz: (index) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(new SpaceHttpError(503, "https://gfz.test"));
        }
        return Promise.resolve(gfzRaw(index));
      },
    });
    const log = recordingLogger();
    const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
    const r = await backfillSpaceHistory(context(flaky, log), {
      from: at("2026-10-01T00:00:00Z"),
      to: NOW,
      sleep,
    });
    expect(r.written.kp_gfz).toBe(15);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(log.entries.filter((e) => e.msg === "request failed; retrying")).toHaveLength(1);

    const broken = stubHistory({ fetchGfz: new SpaceHttpError(404, "https://gfz.test") });
    await expect(
      backfillSpaceHistory(context(broken), { from: at("2026-10-01T00:00:00Z"), to: NOW, sleep }),
    ).rejects.toThrow(/404/);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
