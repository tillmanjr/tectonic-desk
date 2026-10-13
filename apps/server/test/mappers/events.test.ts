import { describe, expect, it } from "vitest";
import type { EventRow } from "../../src/db/schema.js";
import { eventToRow, rowToEvent } from "../../src/mappers/events.js";
import { makeEvent } from "../fixtures.js";

describe("event mappers", () => {
  it("eventToRow carries every USGS field and no bookkeeping", () => {
    const e = makeEvent();
    const row = eventToRow(e);
    expect(row).toEqual(e);
    expect(row).not.toHaveProperty("firstSeen");
    expect(row).not.toHaveProperty("lastSeen");
  });

  it("rowToEvent maps a full row, including bookkeeping, and drops unknown columns", () => {
    const seen = new Date("2026-10-12T07:00:00Z");
    const row: EventRow & { extra: number } = {
      ...makeEvent(),
      firstSeen: seen,
      lastSeen: seen,
      detailCheckedUpdated: null,
      extra: 1,
    };
    const back = rowToEvent(row);
    expect(back).toEqual({
      ...makeEvent(),
      firstSeen: seen,
      lastSeen: seen,
      detailCheckedUpdated: null,
    });
    expect(back).not.toHaveProperty("extra");
  });
});
