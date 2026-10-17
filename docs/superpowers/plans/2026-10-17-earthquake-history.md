# Earthquake History (server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resumable, newest-first historical backfill with a window ledger, the `last_seen` churn fix, id-alias merging, and four aggregate API routes, per `docs/superpowers/specs/2026-10-17-earthquake-history-design.md`.

**Architecture:** Pure helpers (`ingest/windows.ts`, `ingest/retry.ts`, `ingest/cli-args.ts`) feed a rewritten `ingest/backfill.ts` that walks canonical calendar windows newest first and records completed, settled windows in a new `catalog_windows` table through `repositories/catalog-windows.ts`. Aggregates are plain repository functions beside `listEvents` sharing its condition builder, exposed by `routes/events.ts` and a new `routes/catalog.ts`.

**Tech Stack:** TypeScript strict/ESM/NodeNext, Fastify 5, Drizzle 0.45 + drizzle-kit 0.31, Postgres 16, zod 4, vitest 5 with Testcontainers.

## Global Constraints

- Branch `earthquake-history`; never commit to `main`. Commit after each task.
- Coverage thresholds are 100% on `apps/server/src` (lines, branches, functions, statements); `src/ingest-cli.ts` stays excluded.
- Lint: typescript-eslint strict + stylistic, type-checked. No `as` casts to silence nullability, no `!`.
- Repositories are plain functions taking `Db` first. Local imports use the `.js` extension.
- Migrations are generated with `pnpm --filter @tectonic/server db:generate`; never hand-edited.
- Response types live in `packages/shared/src/api.ts`; `raw` never leaves the server.
- Integration tests need Docker; run `pnpm --filter @tectonic/server test` from the repo root (or `pnpm test` for the workspace). Verify with `pnpm --filter @tectonic/server test:coverage`, `pnpm lint`, `pnpm typecheck`.
- All commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Schema, migration and test harness

**Files:**

- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/migrations/0003_*.sql` (generated) and its snapshot
- Modify: `apps/server/test/setup/postgres.ts:33-35`
- Test: `apps/server/test/db/schema.test.ts`

**Interfaces:**

- Produces: `catalogWindows` table (`fromTime, toTime, minMag, bbox, events, pages, runId, completedAt`), `CatalogWindowRow`, `CatalogWindowInsert`; index `events_mag_time_idx`.

- [ ] **Step 1: Extend the schema test**

Replace the second `it` in `apps/server/test/db/schema.test.ts` with:

```ts
it("mechanisms has a unique product key and events has its query indexes", () => {
  const names = (t: typeof events | typeof mechanisms) =>
    getTableConfig(t).indexes.map((i) => i.config.name);
  expect(names(mechanisms)).toContain("mechanisms_event_kind_source_code_uq");
  expect(names(events)).toEqual(
    expect.arrayContaining([
      "events_time_idx",
      "events_lat_lon_idx",
      "events_mag_idx",
      "events_mag_time_idx",
    ]),
  );
});

it("catalog_windows keys on bounds and scope with nulls not distinct, and points at its run", () => {
  const cfg = getTableConfig(catalogWindows);
  const uq = cfg.uniqueConstraints.find((u) => u.name === "catalog_windows_key_uq");
  expect(uq?.columns.map((c) => c.name)).toEqual(["from_time", "to_time", "min_mag", "bbox"]);
  expect(uq?.nullsNotDistinct).toBe(true);
  expect(cfg.foreignKeys[0]?.reference().foreignTable).toBe(ingestRuns);
  expect(cfg.indexes.map((i) => i.config.name)).toContain("catalog_windows_from_idx");
});
```

and import `catalogWindows, ingestRuns` from the schema.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @tectonic/server exec vitest run test/db/schema.test.ts`
Expected: FAIL, `catalogWindows` is not exported.

- [ ] **Step 3: Add the table and index**

In `apps/server/src/db/schema.ts`: add `unique` to the `drizzle-orm/pg-core` import; add `index("events_mag_time_idx").on(t.mag, t.time),` to the `events` index list; after `ingestRuns` add:

```ts
/** One row per completed, settled backfill window and scope: the catalogue's statement of what is loaded and frozen. */
export const catalogWindows = pgTable(
  "catalog_windows",
  {
    id: serial("id").primaryKey(),
    fromTime: timestamp("from_time", tz).notNull(),
    toTime: timestamp("to_time", tz).notNull(),
    /** Magnitude floor the window was loaded with; null = all magnitudes. */
    minMag: doublePrecision("min_mag"),
    /** `minLon,minLat,maxLon,maxLat` as the API spells it; null = global. */
    bbox: text("bbox"),
    events: integer("events").notNull(),
    pages: integer("pages").notNull(),
    runId: integer("run_id")
      .notNull()
      .references(() => ingestRuns.id),
    completedAt: timestamp("completed_at", tz).notNull(),
  },
  (t) => [
    unique("catalog_windows_key_uq").on(t.fromTime, t.toTime, t.minMag, t.bbox).nullsNotDistinct(),
    index("catalog_windows_from_idx").on(t.fromTime),
  ],
);
```

and at the bottom:

```ts
export type CatalogWindowRow = typeof catalogWindows.$inferSelect;
export type CatalogWindowInsert = typeof catalogWindows.$inferInsert;
```

- [ ] **Step 4: Generate the migration and add the table to truncate**

Run: `pnpm --filter @tectonic/server db:generate`
Expected: a new `0003_*.sql` with `CREATE TABLE "catalog_windows"`, `UNIQUE NULLS NOT DISTINCT`, the two indexes and the foreign key. Inspect it.

In `apps/server/test/setup/postgres.ts` change the truncate statement to:

```ts
        sql`truncate table mechanisms, events, ingest_runs, catalog_windows, volcano_status, volcano_reports restart identity cascade`,
```

- [ ] **Step 5: Run the schema and migration tests**

Run: `pnpm --filter @tectonic/server exec vitest run test/db`
Expected: PASS (the migrate test applies 0003 on a fresh container).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle apps/server/test
git commit -m "feat(db): catalog_windows ledger and (mag, time) index"
```

---

### Task 2: Window ledger repository

**Files:**

- Create: `apps/server/src/repositories/catalog-windows.ts`
- Test: `apps/server/test/repositories/catalog-windows.test.ts`

**Interfaces:**

- Produces: `WindowKey { from: Date; to: Date; minMag: number | null; bbox: string | null }`, `WindowRecord extends WindowKey { events: number; pages: number; runId: number; completedAt: Date }`, `CoverageSpan { from; to; minMag; bbox; events; windows }`, `windowCovered(db, key): Promise<boolean>`, `recordWindow(db, rec): Promise<void>`, `coverageSpans(db): Promise<CoverageSpan[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @tectonic/server exec vitest run test/repositories/catalog-windows.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the repository**

```ts
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { catalogWindows } from "../db/schema.js";

/** Identity of a backfill window: bounds plus the scope it was loaded with. */
export interface WindowKey {
  from: Date;
  to: Date;
  /** Magnitude floor; null = all magnitudes. */
  minMag: number | null;
  /** `minLon,minLat,maxLon,maxLat`; null = global. */
  bbox: string | null;
}

export interface WindowRecord extends WindowKey {
  events: number;
  pages: number;
  runId: number;
  completedAt: Date;
}

/** A run of contiguous completed windows with one scope. */
export interface CoverageSpan extends WindowKey {
  events: number;
  windows: number;
}

/**
 * True when a completed window has the same bounds, a floor at or below the
 * requested one (null covers everything) and a bbox that is global or equal.
 */
export async function windowCovered(db: Db, key: WindowKey): Promise<boolean> {
  const floor =
    key.minMag === null
      ? isNull(catalogWindows.minMag)
      : or(isNull(catalogWindows.minMag), lte(catalogWindows.minMag, key.minMag));
  const box =
    key.bbox === null
      ? isNull(catalogWindows.bbox)
      : or(isNull(catalogWindows.bbox), eq(catalogWindows.bbox, key.bbox));
  const rows = await db
    .select({ id: catalogWindows.id })
    .from(catalogWindows)
    .where(
      and(eq(catalogWindows.fromTime, key.from), eq(catalogWindows.toTime, key.to), floor, box),
    )
    .limit(1);
  return rows.length > 0;
}

/** Inserts or replaces the row for the window's key. */
export async function recordWindow(db: Db, rec: WindowRecord): Promise<void> {
  const counts = {
    events: rec.events,
    pages: rec.pages,
    runId: rec.runId,
    completedAt: rec.completedAt,
  };
  await db
    .insert(catalogWindows)
    .values({ fromTime: rec.from, toTime: rec.to, minMag: rec.minMag, bbox: rec.bbox, ...counts })
    .onConflictDoUpdate({
      target: [
        catalogWindows.fromTime,
        catalogWindows.toTime,
        catalogWindows.minMag,
        catalogWindows.bbox,
      ],
      set: counts,
    });
}

/** Completed windows merged into contiguous spans per scope, oldest first. */
export async function coverageSpans(db: Db): Promise<CoverageSpan[]> {
  const rows = await db
    .select()
    .from(catalogWindows)
    .orderBy(asc(catalogWindows.fromTime), asc(catalogWindows.toTime));
  const spans: CoverageSpan[] = [];
  for (const r of rows) {
    const open = spans.find(
      (s) => s.minMag === r.minMag && s.bbox === r.bbox && s.to.getTime() === r.fromTime.getTime(),
    );
    if (open) {
      open.to = r.toTime;
      open.events += r.events;
      open.windows += 1;
    } else {
      spans.push({
        from: r.fromTime,
        to: r.toTime,
        minMag: r.minMag,
        bbox: r.bbox,
        events: r.events,
        windows: 1,
      });
    }
  }
  return spans;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @tectonic/server exec vitest run test/repositories/catalog-windows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/repositories/catalog-windows.ts apps/server/test/repositories/catalog-windows.test.ts
git commit -m "feat(server): window ledger repository"
```

---

### Task 3: `upsertEvents` churn fix, alias merge, candidate order

**Files:**

- Modify: `apps/server/src/repositories/events.ts:30-34, 80-121, 222-241`
- Modify: `apps/server/src/ingest/details.ts` (pass `order`)
- Modify: `apps/server/src/ingest/feed.ts`, `apps/server/src/ingest/backfill.ts` (`merged` in `add`; backfill is rewritten in Task 6, just keep it compiling here)
- Test: `apps/server/test/repositories/events.test.ts`, `apps/server/test/ingest/scheduler.test.ts:14`, `apps/server/test/ingest/sync.test.ts`

**Interfaces:**

- Produces: `UpsertResult { inserted; updated; skipped; merged }`, `CandidateOrder = "time" | "mag"`, `listDetailCandidates(db, limit, order = "time")`, `DetailsOptions.order`.

- [ ] **Step 1: Update and add repository tests**

In `apps/server/test/repositories/events.test.ts`, add `merged: 0` to every `toEqual({ inserted, updated, skipped })` (lines 28, 33, 49, 53, 57, 77, 83). Replace the `bumps last_seen even when the revision is skipped` test with:

```ts
it("bumps last_seen once it is an hour old, never within the hour, and keeps first_seen", async () => {
  const e = makeEvent();
  await upsertEvents(t.db, [e]);
  const fresh = await getEvent(t.db, e.id);
  await upsertEvents(t.db, [e]);
  expect((await getEvent(t.db, e.id))?.lastSeen.getTime()).toBe(fresh?.lastSeen.getTime());
  await t.db.execute(
    sql`update events set last_seen = last_seen - interval '2 hours', first_seen = first_seen - interval '2 hours'`,
  );
  const aged = await getEvent(t.db, e.id);
  await upsertEvents(t.db, [{ ...e, updated: new Date(e.updated.getTime() - 1000) }]);
  const after = await getEvent(t.db, e.id);
  expect(after?.lastSeen.getTime()).toBeGreaterThan(aged?.lastSeen.getTime() ?? 0);
  expect(after?.firstSeen.getTime()).toBe(aged?.firstSeen.getTime());
});

it("replaces rows whose id an incoming event lists as an alias, mechanisms included", async () => {
  await upsertEvents(t.db, [makeEvent({ id: "ci100" }), makeEvent({ id: "nn200" })]);
  await upsertMechanism(t.db, makeMechanism({ eventId: "ci100", code: "old" }));
  const merged = makeEvent({ id: "us900", raw: { ids: ",ci100,us900,zz1," } });
  expect(await upsertEvents(t.db, [merged])).toEqual({
    inserted: 1,
    updated: 0,
    skipped: 0,
    merged: 1,
  });
  expect((await listEvents(t.db)).map((e) => e.id).sort()).toEqual(["nn200", "us900"]);
  expect(await t.db.query.mechanisms.findMany()).toEqual([]);
  // An alias that is itself in the batch is kept; a non-string ids value is ignored.
  expect(
    await upsertEvents(t.db, [
      makeEvent({ id: "a1", raw: { ids: ",a1,a2," } }),
      makeEvent({ id: "a2", raw: { ids: 7 } }),
    ]),
  ).toEqual({ inserted: 2, updated: 0, skipped: 0, merged: 0 });
});

it("orders detail candidates by time or by magnitude, nulls last", async () => {
  await upsertEvents(t.db, [
    makeEvent({
      id: "small",
      mag: 3,
      types: ["moment-tensor"],
      time: new Date("2026-10-12T03:00:00Z"),
    }),
    makeEvent({
      id: "none",
      mag: null,
      types: ["moment-tensor"],
      time: new Date("2026-10-12T02:00:00Z"),
    }),
    makeEvent({
      id: "big",
      mag: 6,
      types: ["focal-mechanism"],
      time: new Date("2026-10-12T01:00:00Z"),
    }),
  ]);
  expect((await listDetailCandidates(t.db, 10)).map((c) => c.id)).toEqual(["small", "none", "big"]);
  expect((await listDetailCandidates(t.db, 10, "mag")).map((c) => c.id)).toEqual([
    "big",
    "small",
    "none",
  ]);
});
```

Import `upsertMechanism` from `../../src/repositories/mechanisms.js` and `makeMechanism` from `../fixtures.js`. In `apps/server/test/ingest/scheduler.test.ts:14` add `merged: 0`. In `apps/server/test/ingest/sync.test.ts` the `syncFeed` expectations on `r.events` gain `merged: 0` wherever they use `toEqual` on the whole object (check with `grep -n "skipped" apps/server/test/ingest/sync.test.ts`).

- [ ] **Step 2: Run to see failures**

Run: `pnpm --filter @tectonic/server exec vitest run test/repositories/events.test.ts`
Expected: FAIL on `merged`, the within-the-hour bump, and the candidate order.

- [ ] **Step 3: Implement**

In `apps/server/src/repositories/events.ts`:

```ts
export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
  /** Stored rows deleted because an incoming event listed their id among its aliases. */
  merged: number;
}
```

Add after `dedupe`:

```ts
/** Other ComCat ids an event has carried, from the comma-wrapped `ids` feed property. */
function aliasesOf(e: Event): string[] {
  const ids = e.raw.ids;
  if (typeof ids !== "string") return [];
  return ids.split(",").filter((s) => s.length > 0 && s !== e.id);
}
```

Replace the `upsertEvents` doc comment and body:

```ts
/**
 * Inserts new events and revises existing ones when the incoming `updated`
 * stamp is at least as new as the stored one. Rows whose id an incoming event
 * lists as an alias are deleted first (ComCat re-keys events between networks).
 * `last_seen` is bumped at most once an hour per row, so a quiet catalogue is
 * not rewritten by every feed poll.
 */
export async function upsertEvents(db: Db, batch: Event[]): Promise<UpsertResult> {
  const unique = dedupe(batch);
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, merged: 0 };
  if (unique.length === 0) return result;
  const batchIds = new Set(unique.map((e) => e.id));

  await db.transaction(async (tx) => {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const aliases = [...new Set(chunk.flatMap(aliasesOf))].filter((id) => !batchIds.has(id));
      if (aliases.length > 0) {
        const gone = await tx
          .delete(events)
          .where(inArray(events.id, aliases))
          .returning({ id: events.id });
        result.merged += gone.length;
      }
      const touched = await tx
        .insert(events)
        .values(chunk.map(eventToRow))
        .onConflictDoUpdate({
          target: events.id,
          set: updateSet,
          setWhere: sql`excluded.updated >= ${events.updated}`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const row of touched) {
        if (row.inserted) result.inserted += 1;
        else result.updated += 1;
      }
      result.skipped += chunk.length - touched.length;
      await tx
        .update(events)
        .set({ lastSeen: sql`now()` })
        .where(
          and(
            inArray(
              events.id,
              chunk.map((e) => e.id),
            ),
            sql`${events.lastSeen} < now() - interval '1 hour'`,
          ),
        );
    }
  });
  return result;
}
```

Replace `listDetailCandidates`:

```ts
export type CandidateOrder = "time" | "mag";

/**
 * Events advertising a mechanism product whose detail has not been fetched
 * since their last revision; newest first, or largest first for a backfill.
 */
export async function listDetailCandidates(
  db: Db,
  limit: number,
  order: CandidateOrder = "time",
): Promise<{ id: string; updated: Date }[]> {
  const byTime = [desc(events.time), desc(events.id)];
  return db
    .select({ id: events.id, updated: events.updated })
    .from(events)
    .where(
      and(
        arrayOverlaps(events.types, MECHANISM_TYPES),
        or(isNull(events.detailCheckedUpdated), lt(events.detailCheckedUpdated, events.updated)),
      ),
    )
    .orderBy(...(order === "mag" ? [sql`${events.mag} desc nulls last`, ...byTime] : byTime))
    .limit(limit);
}
```

In `apps/server/src/ingest/details.ts`: `DetailsOptions` gains `order?: CandidateOrder` (import the type), and `listDetailCandidates(ctx.db, limit, opts.order ?? "time")`.

In `apps/server/src/ingest/feed.ts` nothing references the fields by name; in `apps/server/src/ingest/backfill.ts` extend `add` and the `totals` literal with `merged`.

- [ ] **Step 4: Run the suites**

Run: `pnpm --filter @tectonic/server exec vitest run test/repositories test/ingest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat(server): hourly last_seen, alias merge, magnitude-ordered detail candidates"
```

---

### Task 4: USGS client query parameters

**Files:**

- Modify: `apps/server/src/usgs/client.ts:11-16, 71-84`
- Test: `apps/server/test/usgs/client.test.ts`

**Interfaces:**

- Produces: `QueryParams { starttime: Date; endtime: Date; minmagnitude?: number; bbox?: BBox; limit: number }`.

- [ ] **Step 1: Add a test**

Find the existing `fetchQuery` test in `apps/server/test/usgs/client.test.ts` and add beside it (adapting to the file's fetch stub helper):

```ts
it("sends the floor and bbox only when given", async () => {
  const calls: string[] = [];
  const client = createUsgsClient({
    baseUrl: "https://x.test/",
    userAgent: "t",
    fetch: (url) => {
      calls.push(String(url));
      return Promise.resolve(new Response(JSON.stringify({ features: [] })));
    },
  });
  const starttime = new Date("2020-01-01T00:00:00Z");
  const endtime = new Date("2020-02-01T00:00:00Z");
  await client.fetchQuery({ starttime, endtime, limit: 5 });
  expect(calls[0]).not.toContain("minmagnitude");
  expect(calls[0]).not.toContain("minlatitude");
  await client.fetchQuery({
    starttime,
    endtime,
    limit: 5,
    minmagnitude: 4.5,
    bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
  });
  expect(calls[1]).toContain("minmagnitude=4.5");
  expect(calls[1]).toContain("minlatitude=27&maxlatitude=53&minlongitude=-136&maxlongitude=-104");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @tectonic/server exec vitest run test/usgs/client.test.ts`
Expected: FAIL (type error on the missing `minmagnitude`, or the URL contains `minmagnitude=undefined`).

- [ ] **Step 3: Implement**

```ts
export interface QueryParams {
  starttime: Date;
  endtime: Date;
  /** Omitted = all magnitudes. */
  minmagnitude?: number;
  /** Must not cross the antimeridian; fdsnws has no wrap-around box. */
  bbox?: BBox;
  limit: number;
}
```

and

```ts
    fetchQuery: (p) => {
      const q = new URLSearchParams({
        format: "geojson",
        starttime: p.starttime.toISOString(),
        endtime: p.endtime.toISOString(),
        orderby: "time-asc",
        limit: String(p.limit),
      });
      if (p.minmagnitude !== undefined) q.set("minmagnitude", String(p.minmagnitude));
      if (p.bbox) {
        q.set("minlatitude", String(p.bbox.minLat));
        q.set("maxlatitude", String(p.bbox.maxLat));
        q.set("minlongitude", String(p.bbox.minLon));
        q.set("maxlongitude", String(p.bbox.maxLon));
      }
      return getJson(`${base}/fdsnws/event/1/query?${q.toString()}`, feedDocumentSchema);
    },
```

with `import type { BBox } from "@tectonic/shared";`. The existing backfill passes `minmagnitude` already, so it still compiles.

- [ ] **Step 4: Run, then commit**

Run: `pnpm --filter @tectonic/server exec vitest run test/usgs`
Expected: PASS.

```bash
git add apps/server/src/usgs/client.ts apps/server/test/usgs/client.test.ts
git commit -m "feat(usgs): optional floor and bbox on catalogue queries"
```

---

### Task 5: Window grid and retry helpers

**Files:**

- Create: `apps/server/src/ingest/windows.ts`, `apps/server/src/ingest/retry.ts`
- Test: `apps/server/test/ingest/windows.test.ts`, `apps/server/test/ingest/retry.test.ts`

**Interfaces:**

- Produces: `Window { from: Date; to: Date }`, `MONTHLY_FROM`, `windowAt(t): Window`, `windowsBetween(from, to): Window[]` (newest first), `bboxKey(bbox?: BBox): string | null`; `RetryOptions { attempts?; baseMs?; sleep; log }`, `retryable(err): boolean`, `withRetry(fn, opts)`.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/ingest/windows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bboxKey, windowAt, windowsBetween } from "../../src/ingest/windows.js";

const d = (s: string) => new Date(s);
const iso = (w: { from: Date; to: Date }) => [w.from.toISOString(), w.to.toISOString()];

describe("windows", () => {
  it("uses calendar months from 1970 and calendar years before", () => {
    expect(iso(windowAt(d("2026-10-17T12:00:00Z")))).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
    ]);
    expect(iso(windowAt(d("1969-12-31T23:59:59Z")))).toEqual([
      "1969-01-01T00:00:00.000Z",
      "1970-01-01T00:00:00.000Z",
    ]);
    expect(iso(windowAt(d("1970-01-01T00:00:00Z")))).toEqual([
      "1970-01-01T00:00:00.000Z",
      "1970-02-01T00:00:00.000Z",
    ]);
    expect(iso(windowAt(d("0050-06-01T00:00:00Z")))).toEqual([
      "0050-01-01T00:00:00.000Z",
      "0051-01-01T00:00:00.000Z",
    ]);
  });

  it("lists whole windows intersecting the range, newest first, across the 1970 boundary", () => {
    const w = windowsBetween(d("1968-06-15T00:00:00Z"), d("1971-02-10T00:00:00Z"));
    expect(w).toHaveLength(16);
    expect(iso(w[0] ?? { from: d("0"), to: d("0") })).toEqual([
      "1971-02-01T00:00:00.000Z",
      "1971-03-01T00:00:00.000Z",
    ]);
    expect(w[2]?.from.toISOString()).toBe("1970-12-01T00:00:00.000Z");
    expect(w[13]?.from.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(iso(w[15] ?? { from: d("0"), to: d("0") })).toEqual([
      "1968-01-01T00:00:00.000Z",
      "1969-01-01T00:00:00.000Z",
    ]);
  });

  it("treats the range as half-open and returns nothing for an empty range", () => {
    expect(windowsBetween(d("2020-01-01T00:00:00Z"), d("2020-02-01T00:00:00Z"))).toHaveLength(1);
    expect(windowsBetween(d("2020-02-01T00:00:00Z"), d("2020-02-01T00:00:00Z"))).toEqual([]);
    expect(windowsBetween(d("2020-03-01T00:00:00Z"), d("2020-02-01T00:00:00Z"))).toEqual([]);
  });

  it("formats a bbox key the way the API spells it", () => {
    expect(bboxKey(undefined)).toBeNull();
    expect(bboxKey({ minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 })).toBe("-136,27,-104,53");
  });
});
```

`apps/server/test/ingest/retry.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { retryable, withRetry } from "../../src/ingest/retry.js";
import { UsgsHttpError } from "../../src/usgs/client.js";
import { recordingLogger } from "../support/fixtures.js";

const http = (status: number) => new UsgsHttpError(status, "https://x.test/q");

describe("retry", () => {
  it("classifies rate limits, server errors and non-http failures as retryable", () => {
    expect(retryable(http(429))).toBe(true);
    expect(retryable(http(503))).toBe(true);
    expect(retryable(http(500))).toBe(true);
    expect(retryable(new Error("fetch failed"))).toBe(true);
    expect(retryable(http(400))).toBe(false);
    expect(retryable(http(404))).toBe(false);
  });

  it("retries with doubling delays and returns the first success", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const log = recordingLogger();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(http(503))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep, log, baseMs: 100 })).resolves.toBe("ok");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
    expect(log.entries.map((e) => [e.level, e.obj])).toEqual([
      ["warn", expect.objectContaining({ attempt: 1, delayMs: 100 })],
      ["warn", expect.objectContaining({ attempt: 2, delayMs: 200 })],
    ]);
  });

  it("gives up after the attempts and never retries a 4xx", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const log = recordingLogger();
    const always = vi.fn(() => Promise.reject(http(503)));
    await expect(withRetry(always, { sleep, log, attempts: 3, baseMs: 1 })).rejects.toThrow(/503/);
    expect(always).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    const bad = vi.fn(() => Promise.reject(http(400)));
    await expect(withRetry(bad, { sleep, log })).rejects.toThrow(/400/);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @tectonic/server exec vitest run test/ingest/windows.test.ts test/ingest/retry.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `windows.ts`**

```ts
import type { BBox } from "@tectonic/shared";

export interface Window {
  from: Date;
  to: Date;
}

/** Months from here on, years before: PDE-era volumes need monthly pages, earlier decades do not. */
export const MONTHLY_FROM = Date.UTC(1970, 0, 1);

/** UTC midnight on the first of a month; safe for years below 100, unlike Date.UTC. */
function utcStart(year: number, month: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month, 1);
  return d;
}

/** The canonical window containing `t`. */
export function windowAt(t: Date): Window {
  const y = t.getUTCFullYear();
  if (t.getTime() >= MONTHLY_FROM) {
    const m = t.getUTCMonth();
    return { from: utcStart(y, m), to: utcStart(y, m + 1) };
  }
  return { from: utcStart(y, 0), to: utcStart(y + 1, 0) };
}

/** Every canonical window intersecting the half-open range, newest first. */
export function windowsBetween(from: Date, to: Date): Window[] {
  const out: Window[] = [];
  if (to.getTime() <= from.getTime()) return out;
  let w = windowAt(new Date(to.getTime() - 1));
  while (w.to.getTime() > from.getTime()) {
    out.push(w);
    w = windowAt(new Date(w.from.getTime() - 1));
  }
  return out;
}

/** `minLon,minLat,maxLon,maxLat` as the API spells it; null for a global scope. */
export const bboxKey = (bbox: BBox | undefined): string | null =>
  bbox === undefined ? null : [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].join(",");
```

- [ ] **Step 4: Implement `retry.ts`**

```ts
import { UsgsHttpError } from "../usgs/client.js";
import type { IngestLogger } from "./context.js";

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  sleep: (ms: number) => Promise<void>;
  log: IngestLogger;
}

/** Rate limits, server errors, timeouts and network failures deserve another try; a 4xx does not. */
export const retryable = (err: unknown): boolean =>
  !(err instanceof UsgsHttpError) || err.status === 429 || err.status >= 500;

/** Calls `fn` up to `attempts` times, doubling the pause from `baseMs` after each retryable failure. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const baseMs = opts.baseMs ?? 5_000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !retryable(err)) throw err;
      const delayMs = baseMs * 2 ** (attempt - 1);
      opts.log.warn({ err, attempt, delayMs }, "usgs request failed; retrying");
      await opts.sleep(delayMs);
    }
  }
}
```

- [ ] **Step 5: Run, then commit**

Run: `pnpm --filter @tectonic/server exec vitest run test/ingest/windows.test.ts test/ingest/retry.test.ts`
Expected: PASS.

```bash
git add apps/server/src/ingest/windows.ts apps/server/src/ingest/retry.ts apps/server/test/ingest/windows.test.ts apps/server/test/ingest/retry.test.ts
git commit -m "feat(ingest): canonical backfill windows and request retry"
```

---

### Task 6: Backfill rewrite

**Files:**

- Rewrite: `apps/server/src/ingest/backfill.ts`
- Modify: `apps/server/src/repositories/ingest-runs.ts` (add `updateRunDetail`)
- Test: `apps/server/test/ingest/sync.test.ts` (replace the `backfill` describe), `apps/server/test/repositories/ingest-runs.test.ts` (one case)

**Interfaces:**

- Consumes: Tasks 2-5.
- Produces: `BackfillOptions`, `BackfillResult`, `SETTLE_DAYS`, `backfill(ctx, opts)`, `updateRunDetail(db, id, detail)`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/server/test/repositories/ingest-runs.test.ts`:

```ts
it("updateRunDetail replaces the detail document", async () => {
  const id = await startRun(t.db, "backfill", { a: 1 });
  await updateRunDetail(t.db, id, { b: 2 });
  expect((await getRun(t.db, id))?.detail).toEqual({ b: 2 });
});
```

Replace the `describe("backfill", ...)` block in `apps/server/test/ingest/sync.test.ts` with:

```ts
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
          f.properties.time >= p.starttime.getTime() && f.properties.time < p.endtime.getTime(),
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
    expect(r.pages).toBe(4);
    expect(r.details.fetched).toBe(2);
    expect(c.usgs.calls.detail).toEqual(["sep1", "oct1"]);
    expect(c.usgs.calls.query.map((q) => q.starttime.toISOString())).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      "2026-08-03T00:00:00.000Z",
    ]);
    expect(c.usgs.calls.query[0]).toMatchObject({ minmagnitude: 2.5, limit: 2 });
    expect(c.usgs.calls.query[0]?.bbox).toBeUndefined();
    expect(s.calls).toEqual([7, 7, 7, 7]);
    expect(await coverageSpans(t.db)).toEqual([
      {
        from: new Date("2026-08-01T00:00:00Z"),
        to: new Date("2026-09-01T00:00:00Z"),
        minMag: 2.5,
        bbox: null,
        events: 4,
        windows: 1,
      },
    ]);
    const run = await getRun(t.db, r.runId);
    expect(run).toMatchObject({ kind: "backfill", ok: true, eventsInserted: 5, detailsFetched: 2 });
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
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/400/);
    const runs = await t.db.query.ingestRuns.findMany();
    expect(runs[0]).toMatchObject({ kind: "backfill", ok: false });
    expect(runs[0]?.detail).toMatchObject({
      windowsDone: 3,
      lastWindow: { from: "2026-08-01T00:00:00.000Z" },
    });
    expect((await coverageSpans(t.db)).map((s) => s.from.toISOString())).toEqual([
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
        sleep: () => Promise.resolve(),
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
      sleep: () => Promise.resolve(),
    });
    expect(r.details).toEqual({ candidates: 1, fetched: 0, failed: 1, mechanismsUpserted: 0 });
  });
});
```

Add imports: `coverageSpans` from `../../src/repositories/catalog-windows.js`, `UsgsHttpError` and `type QueryParams` from `../../src/usgs/client.js`.

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @tectonic/server exec vitest run test/ingest/sync.test.ts test/repositories/ingest-runs.test.ts`
Expected: FAIL (type errors: `from` unknown option, `updateRunDetail` missing).

- [ ] **Step 3: Add `updateRunDetail`**

In `apps/server/src/repositories/ingest-runs.ts` after `finishRun`:

```ts
/** Replaces a run's detail document, used for progress while a long run is in flight. */
export async function updateRunDetail(
  db: Db,
  id: number,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.update(ingestRuns).set({ detail }).where(eq(ingestRuns.id, id));
}
```

- [ ] **Step 4: Rewrite `backfill.ts`**

```ts
import type { BBox } from "@tectonic/shared";
import { recordWindow, windowCovered } from "../repositories/catalog-windows.js";
import { upsertEvents, type UpsertResult } from "../repositories/events.js";
import { finishRun, startRun, updateRunDetail } from "../repositories/ingest-runs.js";
import type { QueryParams } from "../usgs/client.js";
import { parseFeedFeatures } from "../usgs/parse.js";
import type { IngestContext } from "./context.js";
import { syncDetails, type DetailsResult } from "./details.js";
import { errorMessage } from "./feed.js";
import { withRetry } from "./retry.js";
import { bboxKey, windowsBetween, type Window } from "./windows.js";

export interface BackfillOptions {
  from: Date;
  to: Date;
  /** Magnitude floor; null loads every magnitude. */
  minMagnitude: number | null;
  bbox?: BBox;
  /** Reload windows the ledger already marks complete. */
  force?: boolean;
  /** Leave detail candidates to the feeds' detail pass. */
  skipDetails?: boolean;
  pageLimit?: number;
  /** Pause after every page request. */
  pauseMs?: number;
  settleDays?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface BackfillResult {
  runId: number;
  windows: { loaded: number; skipped: number; frozen: number };
  pages: number;
  events: UpsertResult;
  details: DetailsResult;
}

const DAY_MS = 86_400_000;
/** Windows that ended more recently than this are reloaded on every run: USGS still revises them. */
export const SETTLE_DAYS = 30;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const noUpserts = (): UpsertResult => ({ inserted: 0, updated: 0, skipped: 0, merged: 0 });

export const addUpserts = (a: UpsertResult, b: UpsertResult): UpsertResult => ({
  inserted: a.inserted + b.inserted,
  updated: a.updated + b.updated,
  skipped: a.skipped + b.skipped,
  merged: a.merged + b.merged,
});

interface Settings {
  minMagnitude: number | null;
  bbox: BBox | undefined;
  pageLimit: number;
  pauseMs: number;
  sleep: (ms: number) => Promise<void>;
}

interface WindowLoad {
  pages: number;
  events: UpsertResult;
}

/** Loads one window page by page, restarting each page from the last event's time. */
async function loadWindow(ctx: IngestContext, w: Window, s: Settings): Promise<WindowLoad> {
  let cursor = w.from;
  const load: WindowLoad = { pages: 0, events: noUpserts() };
  for (;;) {
    const params: QueryParams = { starttime: cursor, endtime: w.to, limit: s.pageLimit };
    if (s.minMagnitude !== null) params.minmagnitude = s.minMagnitude;
    if (s.bbox) params.bbox = s.bbox;
    const doc = await withRetry(() => ctx.usgs.fetchQuery(params), {
      sleep: s.sleep,
      log: ctx.log,
    });
    await s.sleep(s.pauseMs);
    const parsed = parseFeedFeatures(doc, ctx.log);
    load.pages += 1;
    load.events = addUpserts(load.events, await upsertEvents(ctx.db, parsed));
    if (parsed.length < s.pageLimit) return load;
    const last = parsed[parsed.length - 1];
    if (!last || last.time.getTime() <= cursor.getTime()) {
      throw new Error(`backfill cursor cannot advance past ${cursor.toISOString()}`);
    }
    cursor = last.time;
  }
}

/** Fetches detail documents, largest events first, until a pass fetches nothing. */
async function drainDetails(ctx: IngestContext): Promise<DetailsResult> {
  const total: DetailsResult = { candidates: 0, fetched: 0, failed: 0, mechanismsUpserted: 0 };
  for (;;) {
    const r = await syncDetails(ctx, { limit: 200, order: "mag" });
    total.candidates += r.candidates;
    total.fetched += r.fetched;
    total.failed += r.failed;
    total.mechanismsUpserted += r.mechanismsUpserted;
    if (r.candidates === 0 || r.fetched === 0) return total;
  }
}

/**
 * Loads the canonical windows covering [from, to) newest first, skipping
 * windows the ledger marks complete, freezing (recording) those that ended
 * before the settle period, then drains detail candidates. Records one run.
 */
export async function backfill(ctx: IngestContext, opts: BackfillOptions): Promise<BackfillResult> {
  const s: Settings = {
    minMagnitude: opts.minMagnitude,
    bbox: opts.bbox,
    pageLimit: opts.pageLimit ?? 20_000,
    pauseMs: opts.pauseMs ?? 1_000,
    sleep: opts.sleep ?? defaultSleep,
  };
  const startedAt = ctx.now();
  const settled = startedAt.getTime() - (opts.settleDays ?? SETTLE_DAYS) * DAY_MS;
  const bbox = bboxKey(opts.bbox);
  const plan = windowsBetween(opts.from, opts.to);
  const base = {
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    minMagnitude: opts.minMagnitude,
    bbox,
    force: opts.force ?? false,
    skipDetails: opts.skipDetails ?? false,
    windows: plan.length,
  };
  const runId = await startRun(ctx.db, "backfill", base, startedAt);
  const result: BackfillResult = {
    runId,
    windows: { loaded: 0, skipped: 0, frozen: 0 },
    pages: 0,
    events: noUpserts(),
    details: { candidates: 0, fetched: 0, failed: 0, mechanismsUpserted: 0 },
  };
  try {
    for (const [i, w] of plan.entries()) {
      const key = { from: w.from, to: w.to, minMag: opts.minMagnitude, bbox };
      const label = { from: w.from.toISOString(), to: w.to.toISOString() };
      if (opts.force !== true && (await windowCovered(ctx.db, key))) {
        result.windows.skipped += 1;
        ctx.log.info({ runId, window: label }, "window already complete; skipped");
      } else {
        const load = await loadWindow(ctx, w, s);
        result.pages += load.pages;
        result.events = addUpserts(result.events, load.events);
        result.windows.loaded += 1;
        const frozen = w.to.getTime() <= settled;
        if (frozen) {
          const { inserted, updated, skipped } = load.events;
          await recordWindow(ctx.db, {
            ...key,
            events: inserted + updated + skipped,
            pages: load.pages,
            runId,
            completedAt: ctx.now(),
          });
          result.windows.frozen += 1;
        }
        ctx.log.info({ runId, window: label, ...load, frozen }, "window loaded");
      }
      await updateRunDetail(ctx.db, runId, { ...base, windowsDone: i + 1, lastWindow: label });
    }
    if (opts.skipDetails !== true) result.details = await drainDetails(ctx);
    await finishRun(
      ctx.db,
      runId,
      {
        ok: true,
        eventsInserted: result.events.inserted,
        eventsUpdated: result.events.updated,
        eventsSkipped: result.events.skipped,
        detailsFetched: result.details.fetched,
        mechanismsUpserted: result.details.mechanismsUpserted,
      },
      ctx.now(),
    );
    ctx.log.info(result, "backfill complete");
    return result;
  } catch (err) {
    await finishRun(ctx.db, runId, { ok: false, error: errorMessage(err) }, ctx.now());
    throw err;
  }
}
```

Note on `ctx.log.info(result, ...)`: `LogFn` takes `object`; a `BackfillResult` is one.

- [ ] **Step 5: Run the suites**

Run: `pnpm --filter @tectonic/server exec vitest run test/ingest test/repositories/ingest-runs.test.ts`
Expected: PASS. If the second test's `sleep` calls differ, remember the order: retry sleep (5000) happens before the page's pause (0).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ingest/backfill.ts apps/server/src/repositories/ingest-runs.ts apps/server/test
git commit -m "feat(ingest): newest-first windowed backfill with ledger, settle period and retries"
```

---

### Task 7: CLI arguments

**Files:**

- Create: `apps/server/src/ingest/cli-args.ts`
- Modify: `apps/server/src/ingest-cli.ts`
- Modify: `apps/server/src/api/schemas.ts` (export `bboxString`)
- Test: `apps/server/test/ingest/cli-args.test.ts`

**Interfaces:**

- Consumes: `BackfillOptions` (Task 6), `bboxString` zod schema.
- Produces: `BackfillArgs`, `parseBackfillArgs(values, now): BackfillOptions`, `positiveInt(v, name)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseBackfillArgs, positiveInt } from "../../src/ingest/cli-args.js";

const NOW = new Date("2026-10-17T12:00:00Z");

describe("parseBackfillArgs", () => {
  it("accepts --days as a range ending now with the 2.5 default floor", () => {
    expect(parseBackfillArgs({ days: "10" }, NOW)).toEqual({
      from: new Date("2026-10-07T12:00:00Z"),
      to: NOW,
      minMagnitude: 2.5,
    });
  });

  it("accepts --from and --to as dates or stamps and every optional flag", () => {
    expect(
      parseBackfillArgs(
        {
          from: "1900-01-01",
          to: "1950-06-01T06:00:00Z",
          "min-magnitude": "4.5",
          bbox: "-136,27,-104,53",
          force: true,
          "skip-details": true,
          "pause-ms": "250",
        },
        NOW,
      ),
    ).toEqual({
      from: new Date("1900-01-01T00:00:00Z"),
      to: new Date("1950-06-01T06:00:00Z"),
      minMagnitude: 4.5,
      bbox: { minLon: -136, minLat: 27, maxLon: -104, maxLat: 53 },
      force: true,
      skipDetails: true,
      pauseMs: 250,
    });
    expect(parseBackfillArgs({ from: "2026-01-01", "all-magnitudes": true }, NOW)).toEqual({
      from: new Date("2026-01-01T00:00:00Z"),
      to: NOW,
      minMagnitude: null,
    });
  });

  it("rejects conflicting, missing and malformed values", () => {
    const bad = (v: Parameters<typeof parseBackfillArgs>[0], re: RegExp) => {
      expect(() => parseBackfillArgs(v, NOW)).toThrow(re);
    };
    bad({}, /--days or --from/);
    bad({ days: "1", from: "2026-01-01" }, /not both/);
    bad({ days: "0" }, /positive integer/);
    bad({ from: "yesterday" }, /--from must be/);
    bad({ from: "2026-01-01", to: "nope" }, /--to must be/);
    bad({ from: "2026-02-01", to: "2026-01-01" }, /--to must be after/);
    bad({ from: "2026-01-01", "min-magnitude": "big" }, /--min-magnitude/);
    bad({ from: "2026-01-01", "min-magnitude": "3", "all-magnitudes": true }, /not both/);
    bad({ from: "2026-01-01", bbox: "1,2,3" }, /--bbox must be/);
    bad({ from: "2026-01-01", bbox: "170,0,-170,10" }, /antimeridian/);
    bad({ from: "2026-01-01", "pause-ms": "-1" }, /--pause-ms/);
  });

  it("positiveInt parses or rejects", () => {
    expect(positiveInt(undefined, "x")).toBeUndefined();
    expect(positiveInt("3", "x")).toBe(3);
    expect(() => positiveInt("1.5", "--x")).toThrow(/--x must be a positive integer/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @tectonic/server exec vitest run test/ingest/cli-args.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

In `apps/server/src/api/schemas.ts` change `const bboxString` to `export const bboxString`.

`apps/server/src/ingest/cli-args.ts`:

```ts
import { bboxString } from "../api/schemas.js";
import type { BackfillOptions } from "./backfill.js";

/** The `parseArgs` values the backfill command understands. */
export interface BackfillArgs {
  days?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  "min-magnitude"?: string | undefined;
  "all-magnitudes"?: boolean | undefined;
  bbox?: string | undefined;
  force?: boolean | undefined;
  "skip-details"?: boolean | undefined;
  "pause-ms"?: string | undefined;
}

const DAY_MS = 86_400_000;

export function positiveInt(v: string | undefined, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

function date(v: string, name: string): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`${name} must be an ISO date or date-time`);
  return d;
}

function startOf(v: BackfillArgs, now: Date): Date {
  if (v.days !== undefined && v.from !== undefined)
    throw new Error("use --days or --from, not both");
  const days = positiveInt(v.days, "--days");
  if (days !== undefined) return new Date(now.getTime() - days * DAY_MS);
  if (v.from !== undefined) return date(v.from, "--from");
  throw new Error("--days or --from is required");
}

function floorOf(v: BackfillArgs): number | null {
  const m = v["min-magnitude"];
  if (m !== undefined && v["all-magnitudes"] === true) {
    throw new Error("use --min-magnitude or --all-magnitudes, not both");
  }
  if (v["all-magnitudes"] === true) return null;
  if (m === undefined) return 2.5;
  const n = Number(m);
  if (!Number.isFinite(n)) throw new Error("--min-magnitude must be a number");
  return n;
}

/** Turns the CLI flags into backfill options; every rejection names the flag. */
export function parseBackfillArgs(v: BackfillArgs, now: Date): BackfillOptions {
  const from = startOf(v, now);
  const to = v.to === undefined ? now : date(v.to, "--to");
  if (to.getTime() <= from.getTime()) throw new Error("--to must be after --from");
  const opts: BackfillOptions = { from, to, minMagnitude: floorOf(v) };
  if (v.bbox !== undefined) {
    const parsed = bboxString.safeParse(v.bbox);
    if (!parsed.success) throw new Error("--bbox must be minLon,minLat,maxLon,maxLat");
    if (parsed.data.minLon > parsed.data.maxLon) {
      throw new Error("--bbox must not cross the antimeridian; USGS queries cannot wrap");
    }
    opts.bbox = parsed.data;
  }
  if (v.force === true) opts.force = true;
  if (v["skip-details"] === true) opts.skipDetails = true;
  const pause = v["pause-ms"];
  if (pause !== undefined) {
    const n = Number(pause);
    if (!Number.isInteger(n) || n < 0)
      throw new Error("--pause-ms must be a whole number of milliseconds");
    opts.pauseMs = n;
  }
  return opts;
}
```

`apps/server/src/ingest-cli.ts` becomes:

```ts
import { parseArgs } from "node:util";
import pino from "pino";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { backfill } from "./ingest/backfill.js";
import { parseBackfillArgs, positiveInt } from "./ingest/cli-args.js";
import type { IngestContext } from "./ingest/context.js";
import { syncDetails, type DetailsOptions } from "./ingest/details.js";
import { syncFeed } from "./ingest/feed.js";
import { createUsgsClient } from "./usgs/client.js";

const usage = `usage:
  ingest feed day|week
  ingest details [--limit N] [--by-magnitude]
  ingest backfill (--days N | --from DATE [--to DATE])
                  [--min-magnitude M | --all-magnitudes]
                  [--bbox minLon,minLat,maxLon,maxLat]
                  [--force] [--skip-details] [--pause-ms N]`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    days: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    "min-magnitude": { type: "string" },
    "all-magnitudes": { type: "boolean" },
    bbox: { type: "string" },
    force: { type: "boolean" },
    "skip-details": { type: "boolean" },
    "pause-ms": { type: "string" },
    limit: { type: "string" },
    "by-magnitude": { type: "boolean" },
  },
});

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty" } });
const { db, close } = createDb(config.DATABASE_URL);
const ctx: IngestContext = {
  db,
  usgs: createUsgsClient({ baseUrl: config.USGS_BASE_URL, userAgent: config.USGS_USER_AGENT }),
  log,
  now: () => new Date(),
};

try {
  const [command, arg] = positionals;
  if (command === "feed" && (arg === "day" || arg === "week")) {
    const r = await syncFeed(ctx, arg);
    log.info(r, "feed done");
  } else if (command === "details") {
    const opts: DetailsOptions = {};
    const limit = positiveInt(values.limit, "--limit");
    if (limit !== undefined) opts.limit = limit;
    if (values["by-magnitude"] === true) opts.order = "mag";
    const r = await syncDetails(ctx, opts);
    log.info(r, "details done");
  } else if (command === "backfill") {
    const r = await backfill(ctx, parseBackfillArgs(values, new Date()));
    log.info(r, "backfill done");
  } else {
    console.error(usage);
    process.exitCode = 2;
  }
} catch (err) {
  log.error({ err }, "ingest failed");
  process.exitCode = 1;
} finally {
  await close();
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `pnpm --filter @tectonic/server exec vitest run test/ingest/cli-args.test.ts && pnpm --filter @tectonic/server typecheck`
Expected: PASS, no type errors.

```bash
git add apps/server/src/ingest/cli-args.ts apps/server/src/ingest-cli.ts apps/server/src/api/schemas.ts apps/server/test/ingest/cli-args.test.ts
git commit -m "feat(cli): backfill ranges, floors, bbox, force and skip-details flags"
```

---

### Task 8: Aggregate queries, shared types and routes

**Files:**

- Modify: `packages/shared/src/api.ts`
- Modify: `apps/server/src/api/schemas.ts`, `apps/server/src/api/serialize.ts`
- Modify: `apps/server/src/repositories/events.ts` (condition builder, `countEvents`, `summarizeEvents`, `gridEvents`)
- Modify: `apps/server/src/routes/events.ts`; Create: `apps/server/src/routes/catalog.ts`; Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/api/schemas.test.ts`, `apps/server/test/repositories/api-queries.test.ts`, `apps/server/test/routes/events.test.ts`, Create: `apps/server/test/routes/catalog.test.ts`

**Interfaces:**

- Produces (shared): `ApiEventFilter`, `ApiEventQuery extends ApiEventFilter`, `ApiEventCount`, `SummaryBy`, `ApiMagBands`, `ApiSummaryBin`, `ApiEventSummary`, `ApiGridCell`, `ApiEventGrid`, `ApiCoverageSpan`, `ApiCoverage`.
- Produces (server): `EventsFilter`, `EventsQuery extends EventsFilter`, `parseEventsFilter`, `parseSummaryQuery`, `parseGridQuery`, `GRID_CELLS`, `toListFilter(q: EventsFilter & { limit?: number })`, `toApiFilter`, `EventsWhere`, `countEvents`, `summarizeEvents`, `gridEvents`, `catalogRoutes`.

- [ ] **Step 1: Shared types**

In `packages/shared/src/api.ts` replace `ApiEventQuery` with:

```ts
/** The filters applied to a request, after defaults. */
export interface ApiEventFilter {
  since: string;
  until: string | null;
  minMag: number | null;
  bbox: BBox | null;
}

export interface ApiEventQuery extends ApiEventFilter {
  limit: number;
}

export interface ApiEventCount {
  count: number;
  query: ApiEventFilter;
}

export type SummaryBy = "day" | "month" | "year";

/** Counts by magnitude class; events without a magnitude are in the bin's `count` only. */
export interface ApiMagBands {
  lt4: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
}

export interface ApiSummaryBin {
  /** Start of the bin (UTC day, month or year). Empty bins are omitted. */
  start: string;
  count: number;
  maxMag: number | null;
  mags: ApiMagBands;
}

export interface ApiEventSummary {
  by: SummaryBy;
  bins: ApiSummaryBin[];
  query: ApiEventFilter;
}

/** One grid cell, keyed by its south-west corner in degrees. */
export interface ApiGridCell {
  lat: number;
  lon: number;
  count: number;
  maxMag: number | null;
}

export interface ApiEventGrid {
  cell: number;
  cells: ApiGridCell[];
  query: ApiEventFilter;
}

/** A contiguous span of backfill windows that are complete and frozen. */
export interface ApiCoverageSpan {
  from: string;
  to: string;
  minMag: number | null;
  bbox: string | null;
  events: number;
  windows: number;
}

export interface ApiCoverage {
  spans: ApiCoverageSpan[];
}
```

- [ ] **Step 2: Schema tests**

Add to `apps/server/test/api/schemas.test.ts`:

```ts
describe("aggregate queries", () => {
  it("parseEventsFilter shares the list defaults without a limit", () => {
    expect(parseEventsFilter({}, NOW)).toEqual({
      since: WEEK_AGO,
      until: null,
      minMag: null,
      bbox: null,
    });
    expect(issuesOf(() => parseEventsFilter({ limit: 5 }, NOW))).toEqual([
      { path: "", message: expect.stringContaining("Unrecognized") },
    ]);
  });

  it("parseSummaryQuery picks the bin size from the span unless given", () => {
    expect(parseSummaryQuery({}, NOW).by).toBe("day");
    expect(parseSummaryQuery({ since: "2026-06-01" }, NOW).by).toBe("month");
    expect(parseSummaryQuery({ since: "2000-01-01" }, NOW).by).toBe("year");
    expect(parseSummaryQuery({ since: "2000-01-01", until: "2000-02-01" }, NOW).by).toBe("day");
    expect(parseSummaryQuery({ since: "2000-01-01", by: "year" }, NOW).by).toBe("year");
    expect(issuesOf(() => parseSummaryQuery({ by: "week" }, NOW))[0]?.path).toBe("by");
  });

  it("parseGridQuery defaults to one-degree cells and allows only the fixed sizes", () => {
    expect(parseGridQuery({}, NOW).cell).toBe(1);
    expect(parseGridQuery({ cell: "0.25" }, NOW).cell).toBe(0.25);
    expect(issuesOf(() => parseGridQuery({ cell: "3" }, NOW))[0]?.path).toBe("cell");
  });
});
```

Import `parseEventsFilter, parseSummaryQuery, parseGridQuery` from the schemas module. Note: the `parseEventsFilter({ limit: 5 })` case assumes a strict object; if the implementation uses a loose object instead, drop that assertion (choose strict so a stray `limit` on `/count` is a 400, matching the spec's "no limit").

- [ ] **Step 3: Implement schemas and serializer**

In `apps/server/src/api/schemas.ts`:

```ts
import type { BBox, SummaryBy } from "@tectonic/shared";
```

replace `eventsQuerySchema` and the exports below `parseOrThrow` with:

```ts
const eventsFilterSchema = z.strictObject({
  since: isoDate.optional(),
  until: isoDate.optional(),
  minMag: z.coerce.number().min(-2).max(10).optional(),
  bbox: bboxString.optional(),
});

const eventsQuerySchema = eventsFilterSchema.extend({
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

export const summaryBySchema = z.enum(["day", "month", "year"]);
const summaryQuerySchema = eventsFilterSchema.extend({ by: summaryBySchema.optional() });

/** Grid cell sizes in degrees; a fixed set keeps the query cacheable. */
export const GRID_CELLS = [0.25, 0.5, 1, 2, 5] as const;
const gridQuerySchema = eventsFilterSchema.extend({
  cell: z.coerce
    .number()
    .refine((c): c is (typeof GRID_CELLS)[number] => GRID_CELLS.some((g) => g === c), {
      message: `cell must be one of ${GRID_CELLS.join(", ")}`,
    })
    .default(1),
});
```

and

```ts
export interface EventsFilter {
  since: Date;
  until: Date | null;
  minMag: number | null;
  bbox: BBox | null;
}

export interface EventsQuery extends EventsFilter {
  limit: number;
}

type RawFilter = z.output<typeof eventsFilterSchema>;

/** Applies the defaults: since = now - 7 days; until must not precede since. */
function resolveFilter(q: RawFilter, now: Date): EventsFilter {
  const since = q.since ?? new Date(now.getTime() - DEFAULT_WINDOW_MS);
  const until = q.until ?? null;
  if (until && until.getTime() < since.getTime()) {
    throw badRequest([{ path: "until", message: "until must not precede since" }]);
  }
  return { since, until, minMag: q.minMag ?? null, bbox: q.bbox ?? null };
}

export function parseEventsFilter(input: unknown, now: Date): EventsFilter {
  return resolveFilter(parseOrThrow(eventsFilterSchema, input), now);
}

export function parseEventsQuery(input: unknown, now: Date): EventsQuery {
  const q = parseOrThrow(eventsQuerySchema, input);
  return { ...resolveFilter(q, now), limit: q.limit };
}

const DAY_MS = 86_400_000;
/** Day bins up to 120 days, month bins up to 15 years, year bins beyond. */
export function defaultSummaryBy(f: EventsFilter, now: Date): SummaryBy {
  const span = (f.until ?? now).getTime() - f.since.getTime();
  if (span <= 120 * DAY_MS) return "day";
  if (span <= 15 * 365.25 * DAY_MS) return "month";
  return "year";
}

export function parseSummaryQuery(input: unknown, now: Date): EventsFilter & { by: SummaryBy } {
  const q = parseOrThrow(summaryQuerySchema, input);
  const filter = resolveFilter(q, now);
  return { ...filter, by: q.by ?? defaultSummaryBy(filter, now) };
}

export function parseGridQuery(input: unknown, now: Date): EventsFilter & { cell: number } {
  const q = parseOrThrow(gridQuerySchema, input);
  return { ...resolveFilter(q, now), cell: q.cell };
}

export function toListFilter(q: EventsFilter & { limit?: number }): ListEventsFilter {
  const filter: ListEventsFilter = { since: q.since };
  if (q.limit !== undefined) filter.limit = q.limit;
  if (q.until) filter.until = q.until;
  if (q.minMag !== null) filter.minMag = q.minMag;
  if (q.bbox) filter.bbox = q.bbox;
  return filter;
}
```

The existing `toListFilter` test expects `{ since, limit: 5 }` key order only loosely (`toEqual` ignores order), so this passes.

In `apps/server/src/api/serialize.ts` add:

```ts
export function toApiFilter(q: EventsFilter): ApiEventFilter {
  return { since: iso(q.since), until: isoOrNull(q.until), minMag: q.minMag, bbox: q.bbox };
}
```

importing `ApiEventFilter` from shared and `type EventsFilter` from `./schemas.js`.

- [ ] **Step 4: Repository tests**

Add to `apps/server/test/repositories/api-queries.test.ts`:

```ts
it("counts, summarises by period with magnitude bands, and grids events under the list filters", async () => {
  const at = (s: string) => new Date(s);
  await upsertEvents(t.db, [
    makeEvent({
      id: "p1",
      time: at("2024-03-01T00:00:00Z"),
      mag: 3.9,
      latitude: 10.2,
      longitude: 20.7,
    }),
    makeEvent({
      id: "p2",
      time: at("2024-03-02T00:00:00Z"),
      mag: 4.5,
      latitude: 10.9,
      longitude: 20.1,
    }),
    makeEvent({
      id: "p3",
      time: at("2024-04-10T00:00:00Z"),
      mag: 5.5,
      latitude: -10.5,
      longitude: 179.5,
    }),
    makeEvent({
      id: "p4",
      time: at("2025-01-01T00:00:00Z"),
      mag: 6.5,
      latitude: -10.5,
      longitude: -179.5,
    }),
    makeEvent({
      id: "p5",
      time: at("2025-01-02T00:00:00Z"),
      mag: 7.1,
      latitude: 0.5,
      longitude: 0.5,
    }),
    makeEvent({
      id: "p6",
      time: at("2025-01-03T00:00:00Z"),
      mag: null,
      latitude: 0.5,
      longitude: 0.5,
    }),
  ]);
  const since = at("2024-01-01T00:00:00Z");
  expect(await countEvents(t.db, { since })).toBe(6);
  expect(await countEvents(t.db, { since, minMag: 5 })).toBe(3);
  expect(await countEvents(t.db, { since, until: at("2024-12-31T00:00:00Z") })).toBe(3);

  const years = await summarizeEvents(t.db, { since }, "year");
  expect(years).toEqual([
    {
      start: at("2024-01-01T00:00:00Z"),
      count: 3,
      maxMag: 5.5,
      mags: { lt4: 1, m4: 1, m5: 1, m6: 0, m7: 0 },
    },
    {
      start: at("2025-01-01T00:00:00Z"),
      count: 3,
      maxMag: 7.1,
      mags: { lt4: 0, m4: 0, m5: 0, m6: 1, m7: 1 },
    },
  ]);
  const months = await summarizeEvents(t.db, { since, until: at("2024-12-31T00:00:00Z") }, "month");
  expect(months.map((b) => [b.start.toISOString(), b.count])).toEqual([
    ["2024-03-01T00:00:00.000Z", 2],
    ["2024-04-01T00:00:00.000Z", 1],
  ]);
  const days = await summarizeEvents(t.db, { since: at("2025-01-01T00:00:00Z") }, "day");
  expect(days).toHaveLength(3);
  expect(days[2]).toEqual({
    start: at("2025-01-03T00:00:00Z"),
    count: 1,
    maxMag: null,
    mags: { lt4: 0, m4: 0, m5: 0, m6: 0, m7: 0 },
  });

  expect(await gridEvents(t.db, { since }, 1)).toEqual([
    { lat: -11, lon: -180, count: 1, maxMag: 6.5 },
    { lat: -11, lon: 179, count: 1, maxMag: 5.5 },
    { lat: 0, lon: 0, count: 2, maxMag: 7.1 },
    { lat: 10, lon: 20, count: 2, maxMag: 4.5 },
  ]);
  expect(
    await gridEvents(
      t.db,
      { since, bbox: { minLon: 170, minLat: -20, maxLon: -170, maxLat: 0 } },
      5,
    ),
  ).toEqual([
    { lat: -15, lon: -180, count: 1, maxMag: 6.5 },
    { lat: -15, lon: 175, count: 1, maxMag: 5.5 },
  ]);
  expect(await gridEvents(t.db, { since, minMag: 9 }, 1)).toEqual([]);
});
```

Import `countEvents, gridEvents, summarizeEvents` from the events repository.

- [ ] **Step 5: Implement the repository functions**

In `apps/server/src/repositories/events.ts` import `max` from `drizzle-orm` and `SummaryBy` from shared; replace `ListEventsFilter` and the inside of `listEvents`:

```ts
/** The where-clause part of a list request, shared by the list and the aggregates. */
export interface EventsWhere {
  since?: Date;
  until?: Date;
  minMag?: number;
  bbox?: BBox;
}

export interface ListEventsFilter extends EventsWhere {
  limit?: number;
}
```

```ts
function whereOf(filter: EventsWhere): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.since) conditions.push(gte(events.time, filter.since));
  if (filter.until) conditions.push(lte(events.time, filter.until));
  if (filter.minMag !== undefined) conditions.push(gte(events.mag, filter.minMag));
  if (filter.bbox) conditions.push(bboxCondition(filter.bbox));
  return conditions.length ? and(...conditions) : undefined;
}
```

and in `listEvents` use `.where(whereOf(filter))`. Then add after `catalogStats`:

```ts
export async function countEvents(db: Db, filter: EventsWhere): Promise<number> {
  return single(await db.select({ total: count() }).from(events).where(whereOf(filter))).total;
}

export interface MagBands {
  lt4: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
}

export interface SummaryBin {
  start: Date;
  count: number;
  maxMag: number | null;
  mags: MagBands;
}

const bandCount = (where: SQL): SQL<number> =>
  sql<number>`count(*) filter (where ${where})`.mapWith(Number);

const bands = {
  lt4: bandCount(sql`${events.mag} < 4`),
  m4: bandCount(sql`${events.mag} >= 4 and ${events.mag} < 5`),
  m5: bandCount(sql`${events.mag} >= 5 and ${events.mag} < 6`),
  m6: bandCount(sql`${events.mag} >= 6 and ${events.mag} < 7`),
  m7: bandCount(sql`${events.mag} >= 7`),
};

const toDate = (v: string | Date): Date => new Date(v);

/** Non-empty UTC bins of `by` with counts, the largest magnitude and magnitude-class counts. */
export async function summarizeEvents(
  db: Db,
  filter: EventsWhere,
  by: SummaryBy,
): Promise<SummaryBin[]> {
  // `by` is one of three literals, so inlining it keeps GROUP BY identical to the select expression.
  const start = sql<Date>`date_trunc(${sql.raw(`'${by}'`)}, ${events.time}, 'UTC')`.mapWith(toDate);
  const rows = await db
    .select({ start, count: count(), maxMag: max(events.mag), ...bands })
    .from(events)
    .where(whereOf(filter))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({
    start: r.start,
    count: r.count,
    maxMag: r.maxMag,
    mags: { lt4: r.lt4, m4: r.m4, m5: r.m5, m6: r.m6, m7: r.m7 },
  }));
}

export interface GridCell {
  lat: number;
  lon: number;
  count: number;
  maxMag: number | null;
}

/** Event counts per `cell`-degree square, keyed by the square's south-west corner. */
export async function gridEvents(db: Db, filter: EventsWhere, cell: number): Promise<GridCell[]> {
  const lat = sql<number>`floor(${events.latitude} / ${cell}) * ${cell}`.mapWith(Number);
  const lon = sql<number>`floor(${events.longitude} / ${cell}) * ${cell}`.mapWith(Number);
  return db
    .select({ lat, lon, count: count(), maxMag: max(events.mag) })
    .from(events)
    .where(whereOf(filter))
    .groupBy(sql`1, 2`)
    .orderBy(sql`1, 2`);
}
```

If `max(events.mag)` types as `string | null`, wrap it: `sql<number | null>\`max(${events.mag})\``, which keeps the pg float parser's number.

- [ ] **Step 6: Route tests**

Add to `apps/server/test/routes/events.test.ts`:

```ts
it("counts, summarises and grids with the list filters and their own caching", async () => {
  const count = await app.inject({ method: "GET", url: "/api/events/count?minMag=3" });
  expect(count.statusCode).toBe(200);
  expect(count.headers["cache-control"]).toBe("public, max-age=60");
  expect(count.json<ApiEventCount>()).toEqual({
    count: 3,
    query: { since: daysAgo(7).toISOString(), until: null, minMag: 3, bbox: null },
  });
  expect((await app.inject({ method: "GET", url: "/api/events/count?limit=5" })).statusCode).toBe(
    400,
  );

  const summary = await app.inject({ method: "GET", url: "/api/events/summary?since=2026-09-01" });
  expect(summary.headers["cache-control"]).toBe("public, max-age=300");
  const s = summary.json<ApiEventSummary>();
  expect(s.by).toBe("day");
  expect(s.bins.map((b) => b.count)).toEqual([1, 1, 1, 1]);
  expect(s.bins[3]).toMatchObject({ maxMag: 5.5, mags: { m5: 1 } });
  expect((await app.inject({ method: "GET", url: "/api/events/summary?by=week" })).statusCode).toBe(
    400,
  );

  const grid = await app.inject({ method: "GET", url: "/api/events/grid?since=2026-09-01&cell=5" });
  expect(grid.headers["cache-control"]).toBe("public, max-age=300");
  const g = grid.json<ApiEventGrid>();
  expect(g.cell).toBe(5);
  expect(g.cells).toEqual([
    { lat: -20, lon: -180, count: 1, maxMag: 5.5 },
    { lat: -20, lon: 175, count: 1, maxMag: 4.0 },
    { lat: 35, lon: -125, count: 1, maxMag: 3.0 },
    { lat: 40, lon: -125, count: 1, maxMag: 2.6 },
  ]);
  expect((await app.inject({ method: "GET", url: "/api/events/grid?cell=3" })).statusCode).toBe(
    400,
  );
});
```

(The seed has `a` at -18.7/-175.1 M5.5 one day ago, `b` 37/-122 M3.0 ten days ago, `c` 40/-124 M2.6 two days ago, `d` -17/179.5 M4.0 three days ago; with `since=2026-09-01` all four are in range, and the default `since` of seven days excludes `b`, so `/count?minMag=3` gives `a` and `d`... check: `a` 5.5, `d` 4.0, `c` 2.6 excluded by minMag, `b` excluded by time, so the count is **2**, not 3. Use `count: 2`.) Import the three types from shared.

Create `apps/server/test/routes/catalog.test.ts`:

```ts
import type { ApiCoverage } from "@tectonic/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { recordWindow } from "../../src/repositories/catalog-windows.js";
import { startRun } from "../../src/repositories/ingest-runs.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("catalog routes", () => {
  let t: TestDb;
  let app: FastifyInstance;
  beforeAll(async () => {
    t = await startPostgres();
    app = buildApp({ db: t.db });
  });
  afterAll(async () => {
    await app.close();
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
  });

  it("reports frozen coverage as spans with ISO stamps", async () => {
    const runId = await startRun(t.db, "backfill");
    const base = { minMag: 2.5, bbox: null, pages: 1, runId, completedAt: new Date() };
    await recordWindow(t.db, {
      ...base,
      from: new Date("2020-01-01T00:00:00Z"),
      to: new Date("2020-02-01T00:00:00Z"),
      events: 3,
    });
    await recordWindow(t.db, {
      ...base,
      from: new Date("2020-02-01T00:00:00Z"),
      to: new Date("2020-03-01T00:00:00Z"),
      events: 4,
    });
    const res = await app.inject({ method: "GET", url: "/api/catalog/coverage" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.json<ApiCoverage>()).toEqual({
      spans: [
        {
          from: "2020-01-01T00:00:00.000Z",
          to: "2020-03-01T00:00:00.000Z",
          minMag: 2.5,
          bbox: null,
          events: 7,
          windows: 2,
        },
      ],
    });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable", () => {
    expect(true).toBe(true);
  });
}
```

- [ ] **Step 7: Implement the routes**

`apps/server/src/routes/events.ts`:

```ts
import type { ApiEventCount, ApiEventGrid, ApiEventList, ApiEventSummary } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { notFound } from "../api/errors.js";
import {
  eventIdSchema,
  parseEventsFilter,
  parseEventsQuery,
  parseGridQuery,
  parseOrThrow,
  parseSummaryQuery,
  toListFilter,
} from "../api/schemas.js";
import { toApiEvent, toApiEventDetail, toApiFilter } from "../api/serialize.js";
import {
  countEvents,
  getEvent,
  gridEvents,
  listEventsWithPreferred,
  summarizeEvents,
} from "../repositories/events.js";

export const eventRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/events", async (request, reply): Promise<ApiEventList> => {
    const q = parseEventsQuery(request.query, app.now());
    const rows = await listEventsWithPreferred(app.db, toListFilter(q));
    cacheFor(reply, 60);
    return {
      events: rows.map((e) => toApiEvent(e, e.mechanisms)),
      count: rows.length,
      truncated: rows.length >= q.limit,
      query: { ...toApiFilter(q), limit: q.limit },
    };
  });

  app.get("/api/events/count", async (request, reply): Promise<ApiEventCount> => {
    const q = parseEventsFilter(request.query, app.now());
    const total = await countEvents(app.db, toListFilter(q));
    cacheFor(reply, 60);
    return { count: total, query: toApiFilter(q) };
  });

  app.get("/api/events/summary", async (request, reply): Promise<ApiEventSummary> => {
    const q = parseSummaryQuery(request.query, app.now());
    const bins = await summarizeEvents(app.db, toListFilter(q), q.by);
    cacheFor(reply, 300);
    return {
      by: q.by,
      bins: bins.map((b) => ({ ...b, start: b.start.toISOString() })),
      query: toApiFilter(q),
    };
  });

  app.get("/api/events/grid", async (request, reply): Promise<ApiEventGrid> => {
    const q = parseGridQuery(request.query, app.now());
    const cells = await gridEvents(app.db, toListFilter(q), q.cell);
    cacheFor(reply, 300);
    return { cell: q.cell, cells, query: toApiFilter(q) };
  });

  app.get("/api/events/:id", async (request, reply) => {
    const { id } = parseOrThrow(eventIdSchema, request.params);
    const event = await getEvent(app.db, id);
    if (!event) throw notFound("event not found");
    cacheFor(reply, 60);
    return toApiEventDetail(event);
  });

  done();
};
```

`apps/server/src/routes/catalog.ts`:

```ts
import type { ApiCoverage } from "@tectonic/shared";
import type { FastifyPluginCallback } from "fastify";
import { cacheFor } from "../api/cache.js";
import { iso } from "../api/serialize.js";
import { coverageSpans } from "../repositories/catalog-windows.js";

/** What the catalogue holds for certain: the frozen backfill spans. */
export const catalogRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/api/catalog/coverage", async (_request, reply): Promise<ApiCoverage> => {
    const spans = await coverageSpans(app.db);
    cacheFor(reply, 300);
    return {
      spans: spans.map((s) => ({
        from: iso(s.from),
        to: iso(s.to),
        minMag: s.minMag,
        bbox: s.bbox,
        events: s.events,
        windows: s.windows,
      })),
    };
  });
  done();
};
```

In `apps/server/src/app.ts` import `catalogRoutes` and add `void app.register(catalogRoutes);` after `volcanoRoutes`.

- [ ] **Step 8: Run everything**

Run: `pnpm --filter @tectonic/shared build && pnpm --filter @tectonic/server exec vitest run test/api test/repositories test/routes`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/api.ts apps/server/src apps/server/test
git commit -m "feat(api): event count, summary, grid and catalogue coverage routes"
```

---

### Task 9: Docs, full verification

**Files:**

- Modify: `README.md` (quick start line 26, Ingest section, API table, deploy step 4, scripts table), `CLAUDE.md` (Ingest and API sections)

- [ ] **Step 1: README**

Quick start: `pnpm ingest backfill --days 90    # optional: load recent history (several minutes)`.

Ingest section, append two bullets:

```md
- History is loaded with `pnpm ingest backfill`, newest first, in calendar-month windows
  (calendar years before 1970). A window that ended more than 30 days before the run is
  recorded in `catalog_windows` once loaded and is never fetched again (`--force` overrides);
  younger windows are reloaded each run because USGS still revises them. Page requests pause
  one second apart and back off on 429 and 5xx. `GET /api/catalog/coverage` reports the frozen
  spans.
- `last_seen` is bumped at most once an hour per event, so polling a quiet catalogue does not
  rewrite it.
```

API table, add rows:

```md
| `GET /api/events/count` | `{ count, query }` under the list filters |
| `GET /api/events/summary` | `{ by, bins, query }`: per day, month or year (`by=`, default by span) with max magnitude and magnitude-class counts |
| `GET /api/events/grid` | `{ cell, cells, query }`: counts per `cell`-degree square (0.25, 0.5, 1, 2 or 5) |
| `GET /api/catalog/coverage`| `{ spans }`: contiguous frozen backfill windows per magnitude floor and bbox |
```

Deploy step 4, replace the single command with:

```sh
cd /opt/tectonic-desk
docker compose -f docker-compose.prod.yml run --rm -d server \
  node dist/ingest-cli.js backfill --from 1900-01-01 --skip-details
docker logs -f "$(docker ps -q --filter name=server-run | head -1)"
```

and the paragraph: "The first command loads global M2.5+ back to 1900 in a few hours and freezes each settled window as it goes, so it can be stopped and rerun. Add `--from 1500-01-01 --to 1900-01-01 --all-magnitudes` for the pre-instrumental US record. Detail fetches (mechanisms) then drain through the feeds' detail pass, or faster with `node dist/ingest-cli.js details --by-magnitude --limit 5000`. Afterwards run `VACUUM (ANALYZE) events;` once through `docker compose -f docker-compose.prod.yml exec postgres psql -U tectonic tectonic`."

Scripts table: `pnpm ingest backfill --from DATE [--to DATE] [--min-magnitude M | --all-magnitudes] [--bbox …] [--force] [--skip-details]` with the description "load history newest first, freezing settled windows; `--days N` for a recent range" and `pnpm ingest details` gains `--by-magnitude`.

- [ ] **Step 2: CLAUDE.md**

Ingest section, add:

```md
- Backfill: `ingest/backfill.ts` walks `windowsBetween(from, to)` (`ingest/windows.ts`: UTC calendar months from 1970, years before; never clipped) newest first, skips windows `windowCovered` in `catalog_windows`, and records a window only when it ended `SETTLE_DAYS` (30) before the run. Page requests go through `withRetry` (`ingest/retry.ts`, 429/5xx/network, 5 attempts doubling from 5 s) and an injectable `sleep`. `upsertEvents` deletes rows named in an incoming event's `ids` aliases (`merged`) and bumps `last_seen` at most hourly. CLI flags are parsed by the pure `ingest/cli-args.ts`.
```

API section, add: "Aggregates (`/api/events/count|summary|grid`) and `/api/catalog/coverage` take the list filters through `parseEventsFilter`; `summarizeEvents` and `gridEvents` group by ordinal (`group by 1`) so parameterised expressions match."

- [ ] **Step 3: Full verification**

Run from the repo root:

```bash
pnpm lint && pnpm typecheck && pnpm --filter @tectonic/server test:coverage 2>&1 | tail -40
```

Expected: lint and typecheck clean; coverage 100% on all four metrics for `apps/server/src`. Then `pnpm --filter @tectonic/web test` (the shared type change must not break the web build) and `pnpm build`.

- [ ] **Step 4: Commit and push**

```bash
git add README.md CLAUDE.md
git commit -m "docs: historical backfill, ledger and aggregate routes"
git push -u origin earthquake-history
```

Then give the user the compare link `https://github.com/tillmanjr/tectonic-desk/compare/main...earthquake-history?expand=1`.
