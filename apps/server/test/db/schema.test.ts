import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { events, mechanisms } from "../../src/db/schema.js";

describe("schema", () => {
  it("mechanisms.event_id references events.id with cascade delete", () => {
    const { foreignKeys } = getTableConfig(mechanisms);
    expect(foreignKeys).toHaveLength(1);
    const fk = foreignKeys[0]?.reference();
    expect(fk?.columns.map((c) => c.name)).toEqual(["event_id"]);
    expect(fk?.foreignColumns.map((c) => c.name)).toEqual(["id"]);
    expect(fk?.foreignTable).toBe(events);
    expect(foreignKeys[0]?.onDelete).toBe("cascade");
  });

  it("mechanisms has a unique product key and events has its query indexes", () => {
    const names = (t: typeof events | typeof mechanisms) =>
      getTableConfig(t).indexes.map((i) => i.config.name);
    expect(names(mechanisms)).toContain("mechanisms_event_kind_source_code_uq");
    expect(names(events)).toEqual(
      expect.arrayContaining(["events_time_idx", "events_lat_lon_idx", "events_mag_idx"]),
    );
  });
});
