import { describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import { catalogStats } from "../../src/repositories/events.js";

describe("catalogStats", () => {
  it("throws when an aggregate query returns no row", async () => {
    const db = { select: () => ({ from: () => Promise.resolve([]) }) } as unknown as Db;
    await expect(catalogStats(db)).rejects.toThrow(/no row/);
  });
});
