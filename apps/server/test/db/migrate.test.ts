import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrate.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("migrations", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });

  it("creates the events and mechanisms tables", async () => {
    const rows = await t.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const names = rows.rows.map((r) => r.table_name);
    expect(names).toContain("events");
    expect(names).toContain("mechanisms");
  });

  it("is idempotent", async () => {
    await expect(runMigrations(t.db)).resolves.toBeUndefined();
  });

  it("enforces the mechanism kind check", async () => {
    await t.db.execute(sql`insert into events (id, time, updated, latitude, longitude, raw)
      values ('x1', now(), now(), 0, 0, '{}'::jsonb)`);
    await expect(
      t.db.execute(sql`insert into mechanisms (event_id, kind, source, code, raw)
        values ('x1', 'zz', 'us', 'c', '{}'::jsonb)`),
    ).rejects.toMatchObject({ cause: { constraint: "mechanisms_kind_check" } });
    await t.truncate();
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
