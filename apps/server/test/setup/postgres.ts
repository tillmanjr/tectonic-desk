import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";

const exec = promisify(execFile);

export interface TestDb {
  db: Db;
  truncate: () => Promise<void>;
  stop: () => Promise<void>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * True when the Docker daemon answers, so the integration suites can run. On a developer
 * machine without Docker they skip. In CI (GitHub sets `CI=true`) Docker is required: the daemon
 * is given a few tries to come up, and if it never answers this throws, because suites that
 * skip silently leave the coverage gate to fail with no useful message.
 */
export async function dockerAvailable(): Promise<boolean> {
  const ci = process.env.CI !== undefined && process.env.CI !== "";
  const attempts = ci ? 6 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      await exec("docker", ["info"], { timeout: 20_000 });
      return true;
    } catch {
      if (i < attempts - 1) await sleep(5_000);
    }
  }
  if (ci) throw new Error("Docker did not answer; the server integration suites need it in CI");
  return false;
}

export async function startPostgres(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const { db, close } = createDb(container.getConnectionUri());
  await runMigrations(db);
  return {
    db,
    truncate: async () => {
      await db.execute(
        sql`truncate table mechanisms, events, ingest_runs, catalog_windows, volcano_status, volcano_reports, space_samples, space_flares, space_alerts, space_scales restart identity cascade`,
      );
    },
    stop: async () => {
      await close();
      await container.stop();
    },
  };
}
