import { describe, expect, it } from "vitest";
import {
  ALL_GROUP,
  createMarks,
  defaultName,
  MARKS_KEY,
  parseMarks,
  type MarkDraft,
} from "../../src/lib/marks.js";

const quake: MarkDraft = {
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/wc?event=us1",
  frame: "wc",
  lon: -122.1,
  lat: 37.4,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
};
const volcano: MarkDraft = { ...quake, kind: "volcano", ref: "211060", name: "Etna", stamp: null };

function memory(seed: string | null = null) {
  const store = new Map<string, string>();
  if (seed !== null) store.set(MARKS_KEY, seed);
  return {
    store,
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
}
function deps() {
  let n = 0;
  return { id: () => `id${String(++n)}`, now: () => new Date("2026-10-21T12:00:00Z") };
}

describe("marks", () => {
  it("parses a document, dropping malformed marks, foreign ids and an 'all' group", () => {
    const good = { ...quake, id: "a", createdAt: "2026-10-21T00:00:00.000Z" };
    const doc = {
      v: 1,
      marks: [
        good,
        { ...good, id: "b", lon: "x" },
        { ...good, id: "c", kind: "comet" },
        { ...good, id: "d", stamp: 5 },
        { ...good, id: "e", frame: "mars" },
        { ...good, id: 9 },
        7,
      ],
      groups: [
        { id: "g1", name: "Pacific", marks: ["a", "zzz", 4] },
        { id: "all", name: "nope", marks: [] },
        { id: 3 },
        "no",
      ],
    };
    const parsed = parseMarks(JSON.stringify(doc));
    expect(parsed.marks.map((m) => m.id)).toEqual(["a"]);
    expect(parsed.groups).toEqual([{ id: "g1", name: "Pacific", marks: ["a"] }]);
    expect(parseMarks(null)).toEqual({ marks: [], groups: [] });
    expect(parseMarks("nope")).toEqual({ marks: [], groups: [] });
    expect(parseMarks("[]")).toEqual({ marks: [], groups: [] });
    expect(parseMarks('{"marks":{},"groups":{}}')).toEqual({ marks: [], groups: [] });
  });

  it("names a subject from its headline and place", () => {
    expect(defaultName(quake)).toBe("M5.5 mww · 10 km N of Somewhere");
  });

  it("adds newest first, renames with trimming, and removes across groups", () => {
    const m = memory();
    const s = createMarks(m.storage, deps());
    const a = s.add(quake);
    const b = s.add(volcano);
    expect(s.marks.value.map((x) => x.id)).toEqual(["id2", "id1"]);
    expect(a.createdAt).toBe("2026-10-21T12:00:00.000Z");
    s.rename(a.id, "  Renamed  ");
    expect(s.marks.value[1]?.name).toBe("Renamed");
    s.rename(a.id, "   ");
    expect(s.marks.value[1]?.name).toBe("M5.5 mww");
    s.rename(a.id, "x".repeat(200));
    expect(s.marks.value[1]?.name).toHaveLength(120);
    s.rename("nope", "ignored");
    expect(s.add({ ...quake, name: " " }).name).toBe("M5.5 mww");
    const g = s.addGroup("Pacific");
    s.setMember(a.id, g.id, true);
    s.setMember(b.id, g.id, true);
    expect(s.view(g.id)?.marks.map((x) => x.id)).toEqual([b.id, a.id]);
    s.remove(a.id);
    expect(s.marks.value.map((x) => x.id)).toEqual(["id3", b.id]);
    expect(s.groups.value[0]?.marks).toEqual([b.id]);
    expect(JSON.parse(m.store.get(MARKS_KEY) ?? "")).toMatchObject({ v: 1 });
    expect(s.countFor("volcano", "211060")).toBe(1);
    expect(s.countFor("event", "us1")).toBe(1);
  });

  it("manages groups, membership and views", () => {
    const s = createMarks(null, deps());
    const a = s.add(quake);
    const g = s.addGroup("   ");
    expect(g.name).toBe("Group 1");
    s.renameGroup(g.id, "Cascadia");
    expect(s.groups.value[0]?.name).toBe("Cascadia");
    s.renameGroup(g.id, " ");
    expect(s.groups.value[0]?.name).toBe("Cascadia");
    s.setMember(a.id, g.id, true);
    s.setMember(a.id, g.id, true);
    expect(s.groups.value[0]?.marks).toEqual([a.id]);
    expect(s.groupsOf(a.id).map((x) => x.id)).toEqual([g.id]);
    s.setMember(a.id, ALL_GROUP, false);
    s.setMember(a.id, "nope", true);
    s.setMember("nope", g.id, true);
    expect(s.view(ALL_GROUP)).toMatchObject({ id: "all", name: "All", virtual: true });
    expect(s.view(ALL_GROUP)?.marks).toHaveLength(1);
    expect(s.view(g.id)).toMatchObject({ virtual: false, name: "Cascadia" });
    expect(s.view("nope")).toBeNull();
    s.setMember(a.id, g.id, false);
    s.setMember(a.id, g.id, false);
    expect(s.groupsOf(a.id)).toEqual([]);
    s.renameGroup("nope", "x");
    s.removeGroup(g.id);
    s.removeGroup("nope");
    expect(s.groups.value).toEqual([]);
  });

  it("reads a seeded document and survives storage that throws", () => {
    const seeded = memory(
      JSON.stringify({
        v: 1,
        marks: [{ ...quake, id: "k", createdAt: "2026-10-01T00:00:00.000Z" }],
        groups: [],
      }),
    );
    expect(createMarks(seeded.storage).marks.value[0]?.id).toBe("k");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const s = createMarks(broken, deps());
    expect(s.marks.value).toEqual([]);
    expect(() => s.add(quake)).not.toThrow();
    expect(s.marks.value).toHaveLength(1);
    const real = createMarks(null);
    const m1 = real.add(quake);
    const m2 = real.add(quake);
    expect(m1.id).not.toBe(m2.id);
    expect(m1.createdAt).toMatch(/^\d{4}-/);
  });
});
