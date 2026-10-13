import { describe, expect, it } from "vitest";
import {
  iso,
  isoOrNull,
  toApiEvent,
  toApiEventDetail,
  toApiMechanism,
  toApiRun,
} from "../../src/api/serialize.js";
import type { IngestRunRow } from "../../src/db/schema.js";
import { makeEvent, makeMechanism } from "../fixtures.js";

const stored = {
  ...makeEvent(),
  firstSeen: new Date("2026-10-12T05:00:00Z"),
  lastSeen: new Date("2026-10-12T06:00:00Z"),
  detailCheckedUpdated: null,
};
const mech = { ...makeMechanism(), id: 7 };

describe("serializers", () => {
  it("iso helpers", () => {
    expect(iso(new Date("2026-10-12T05:00:00Z"))).toBe("2026-10-12T05:00:00.000Z");
    expect(isoOrNull(null)).toBeNull();
    expect(isoOrNull(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
  });

  it("toApiMechanism drops raw and stringifies productUpdated", () => {
    const m = toApiMechanism(mech);
    expect(m).not.toHaveProperty("raw");
    expect(m).toMatchObject({ id: 7, kind: "mt", productUpdated: "2026-10-12T05:30:00.000Z" });
    expect(toApiMechanism({ ...mech, productUpdated: null }).productUpdated).toBeNull();
  });

  it("toApiEvent keeps the feed fields, drops raw and storage stamps, attaches mechanisms", () => {
    const e = toApiEvent(stored, [mech]);
    expect(e).not.toHaveProperty("raw");
    expect(e).not.toHaveProperty("firstSeen");
    expect(e).toMatchObject({
      id: "us6000u1pl",
      time: "2026-10-12T04:38:12.859Z",
      updated: "2026-10-12T06:00:00.000Z",
      types: ["origin", "phase-data"],
      mechanisms: [{ id: 7 }],
    });
  });

  it("toApiEventDetail adds stamps and the raw properties as usgs", () => {
    const d = toApiEventDetail({ ...stored, mechanisms: [mech] });
    expect(d).toMatchObject({
      firstSeen: "2026-10-12T05:00:00.000Z",
      lastSeen: "2026-10-12T06:00:00.000Z",
      detailCheckedUpdated: null,
      usgs: { title: "M 5.5 - 122 km W of Neiafu, Tonga" },
    });
    expect(d).not.toHaveProperty("raw");
    expect(d.mechanisms).toHaveLength(1);
  });

  it("toApiRun stringifies the timestamps", () => {
    const row: IngestRunRow = {
      id: 3,
      kind: "feed_day",
      startedAt: new Date("2026-10-13T01:00:00Z"),
      finishedAt: null,
      ok: null,
      eventsInserted: 1,
      eventsUpdated: 2,
      eventsSkipped: 3,
      detailsFetched: 4,
      mechanismsUpserted: 5,
      error: null,
      detail: { feed: "2.5_day" },
    };
    expect(toApiRun(row)).toEqual({
      ...row,
      startedAt: "2026-10-13T01:00:00.000Z",
      finishedAt: null,
    });
  });
});
