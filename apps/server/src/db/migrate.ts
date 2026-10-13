import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client.js";

/** Resolves to apps/server/drizzle/migrations from both src/db and dist/db. */
export const migrationsFolder = fileURLToPath(
  new URL("../../drizzle/migrations/", import.meta.url),
);

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
