import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getEvent, upsertEvents } from "../../src/repositories/events.js";
import { deleteMechanism, upsertMechanism } from "../../src/repositories/mechanisms.js";
import { makeEvent, makeMechanism } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("mechanisms repository", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
    await upsertEvents(t.db, [makeEvent()]);
  });

  it("inserts and is returned with the event", async () => {
    const m = makeMechanism();
    await upsertMechanism(t.db, m);
    const got = await getEvent(t.db, m.eventId);
    expect(got?.mechanisms).toHaveLength(1);
    expect(got?.mechanisms[0]).toMatchObject(m);
    expect(got?.mechanisms[0]?.id).toEqual(expect.any(Number));
  });

  it("updates in place on the unique key instead of duplicating", async () => {
    const m = makeMechanism();
    await upsertMechanism(t.db, m);
    await upsertMechanism(t.db, { ...m, mw: 5.6, percentDc: 0.9, preferred: false });
    const got = await getEvent(t.db, m.eventId);
    expect(got?.mechanisms).toHaveLength(1);
    expect(got?.mechanisms[0]).toMatchObject({ mw: 5.6, percentDc: 0.9, preferred: false });
  });

  it("keeps distinct products apart", async () => {
    await upsertMechanism(t.db, makeMechanism({ kind: "mt", source: "us", code: "a" }));
    await upsertMechanism(t.db, makeMechanism({ kind: "fm", source: "nc", code: "b" }));
    expect((await getEvent(t.db, "us6000u1pl"))?.mechanisms).toHaveLength(2);
  });

  it("deletes one product by key and leaves the others", async () => {
    await upsertMechanism(t.db, makeMechanism({ code: "a" }));
    await upsertMechanism(t.db, makeMechanism({ code: "b" }));
    await deleteMechanism(t.db, { eventId: "us6000u1pl", kind: "mt", source: "us", code: "a" });
    const got = await getEvent(t.db, "us6000u1pl");
    expect(got?.mechanisms.map((m) => m.code)).toEqual(["b"]);
  });

  it("rejects a mechanism for an unknown event", async () => {
    await expect(
      upsertMechanism(t.db, makeMechanism({ eventId: "missing" })),
    ).rejects.toMatchObject({ cause: { constraint: "mechanisms_event_id_events_id_fk" } });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
