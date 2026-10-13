import { describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import { startRun } from "../../src/repositories/ingest-runs.js";

describe("startRun", () => {
  it("throws when the insert returns no row", async () => {
    const chain = { values: () => chain, returning: () => Promise.resolve([]) };
    const db = { insert: () => chain } as unknown as Db;
    await expect(startRun(db, "details")).rejects.toThrow(/no row/);
  });
});
