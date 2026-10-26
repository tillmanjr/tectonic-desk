import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  catalogWindows,
  events,
  ingestRuns,
  mechanisms,
  spaceAlerts,
  spaceAurora,
  spaceSamples,
  spaceScales,
} from "../../src/db/schema.js";

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

  it("space tables key samples by series, time and source, alerts by product and issue, scales by day and kind", () => {
    const pk = (t: typeof spaceSamples | typeof spaceAlerts | typeof spaceScales) =>
      getTableConfig(t).primaryKeys[0]?.columns.map((c) => c.name);
    expect(pk(spaceSamples)).toEqual(["series", "time", "source"]);
    expect(pk(spaceAlerts)).toEqual(["product_id", "issue_time"]);
    expect(pk(spaceScales)).toEqual(["day", "kind"]);
    expect(getTableConfig(spaceSamples).indexes.map((i) => i.config.name)).toEqual([
      "space_samples_series_time_idx",
    ]);
    const grid = getTableConfig(spaceAurora).columns.find((c) => c.name === "grid");
    expect(grid?.getSQLType()).toBe("bytea");
    expect(grid?.notNull).toBe(true);
  });
});
