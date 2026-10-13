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

/** True when the Docker daemon answers; integration suites skip otherwise. */
export async function dockerAvailable(): Promise<boolean> {
  try {
    await exec("docker", ["info"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function startPostgres(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const { db, close } = createDb(container.getConnectionUri());
  await runMigrations(db);
  return {
    db,
    truncate: async () => {
      await db.execute(sql`truncate table mechanisms, events restart identity cascade`);
    },
    stop: async () => {
      await close();
      await container.stop();
    },
  };
}
