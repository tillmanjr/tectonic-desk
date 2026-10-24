import { describe, expect, it } from "vitest";
import {
  ALL_GROUP,
  countsText,
  createMarks,
  defaultName,
  exportDocument,
  exportFileName,
  MARKS_KEY,
  mergeDocuments,
  parseMarks,
  reportText,
  type Mark,
  type MarkDraft,
  type MarksDocument,
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
  mag: 5.5,
  depthKm: 10,
};
const volcano: MarkDraft = {
  ...quake,
  kind: "volcano",
  ref: "211060",
  name: "Etna",
  stamp: null,
  mag: null,
  depthKm: null,
};

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
    expect(parsed.marks[0]).toMatchObject({ mag: 5.5, depthKm: 10 });
    // marks saved before mag and depth existed: the magnitude comes from the headline
    const legacy: Record<string, unknown> = { ...good };
    delete legacy.mag;
    delete legacy.depthKm;
    const old = parseMarks(JSON.stringify({ v: 1, marks: [legacy], groups: [] })).marks[0];
    expect(old).toMatchObject({ mag: 5.5, depthKm: null });
    const named = parseMarks(
      JSON.stringify({ v: 1, marks: [{ ...legacy, headline: "Etna" }], groups: [] }),
    ).marks[0];
    expect(named).toMatchObject({ mag: null, depthKm: null });
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
    expect(s.view(g.id)?.marks.map((x) => x.id)).toEqual([a.id, b.id]);
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

  it("moves a mark within All and within a group, ignoring the ends and unknown ids", () => {
    const m = memory();
    const s = createMarks(m.storage, deps());
    const a = s.add(quake);
    const b = s.add(volcano);
    const c = s.add({ ...quake, ref: "us3", name: "third" });
    const ids = () => s.marks.value.map((x) => x.id);
    expect(ids()).toEqual([c.id, b.id, a.id]);
    s.move(ALL_GROUP, a.id, -1);
    expect(ids()).toEqual([c.id, a.id, b.id]);
    s.move(ALL_GROUP, c.id, -1);
    s.move(ALL_GROUP, b.id, 1);
    s.move(ALL_GROUP, "nope", 1);
    s.move("nope", a.id, 1);
    expect(ids()).toEqual([c.id, a.id, b.id]);
    const written = () => JSON.parse(m.store.get(MARKS_KEY) ?? "") as { marks: { id: string }[] };
    expect(written().marks.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
    const g = s.addGroup("Order");
    s.setMember(a.id, g.id, true);
    s.setMember(b.id, g.id, true);
    s.setMember(c.id, g.id, true);
    expect(s.view(g.id)?.marks.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    s.move(g.id, c.id, -1);
    expect(s.view(g.id)?.marks.map((x) => x.id)).toEqual([a.id, c.id, b.id]);
    s.move(g.id, a.id, -1);
    s.move(g.id, b.id, 1);
    s.move(g.id, "nope", -1);
    expect(s.groups.value[0]?.marks).toEqual([a.id, c.id, b.id]);
    expect(ids()).toEqual([c.id, a.id, b.id]);
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

  it("moves a stored group up or down, ignoring the ends and unknown ids", () => {
    const m = memory();
    const s = createMarks(m.storage, deps());
    const a = s.addGroup("A");
    const b = s.addGroup("B");
    const c = s.addGroup("C");
    const ids = () => s.groups.value.map((g) => g.id);
    s.moveGroup(c.id, -1);
    expect(ids()).toEqual([a.id, c.id, b.id]);
    s.moveGroup(a.id, -1);
    s.moveGroup(b.id, 1);
    s.moveGroup("nope", 1);
    expect(ids()).toEqual([a.id, c.id, b.id]);
    s.moveGroup(a.id, 1);
    expect(ids()).toEqual([c.id, a.id, b.id]);
    const written = JSON.parse(m.store.get(MARKS_KEY) ?? "") as { groups: { id: string }[] };
    expect(written.groups.map((g) => g.id)).toEqual([c.id, a.id, b.id]);
  });

  const at = new Date("2026-10-24T09:30:00Z");
  const stored = (id: string, over: Partial<Mark> = {}): Mark => ({
    ...quake,
    id,
    createdAt: "2026-10-21T00:00:00.000Z",
    ...over,
  });

  it("exports the document as versioned, dated JSON with a dated file name", () => {
    const doc: MarksDocument = {
      marks: [stored("a")],
      groups: [{ id: "g", name: "G", marks: ["a"] }],
    };
    const text = exportDocument(doc, at);
    expect(JSON.parse(text)).toEqual({ v: 1, exportedAt: "2026-10-24T09:30:00.000Z", ...doc });
    expect(text.startsWith("{\n")).toBe(true);
    expect(parseMarks(text)).toEqual(doc);
    expect(exportFileName(at)).toBe("tectonic-marks-2026-10-24.json");
  });

  it("merges what the incoming document adds and counts it", () => {
    const current: MarksDocument = {
      marks: [stored("a"), stored("b")],
      groups: [
        { id: "g0", name: "Mine", marks: ["b"] },
        { id: "g1", name: "One", marks: ["a"] },
      ],
    };
    const incoming: MarksDocument = {
      marks: [stored("b", { name: "renamed" }), stored("c")],
      groups: [
        { id: "g1", name: "Other name", marks: ["a", "b", "c", "zz"] },
        { id: "g2", name: "Two", marks: ["c", "zz"] },
      ],
    };
    const { doc, report } = mergeDocuments(current, incoming);
    expect(doc.marks.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(doc.marks[1]?.name).toBe("Kuril shock");
    expect(doc.groups).toEqual([
      { id: "g0", name: "Mine", marks: ["b"] },
      { id: "g1", name: "One", marks: ["a", "b", "c"] },
      { id: "g2", name: "Two", marks: ["c"] },
    ]);
    expect(report).toEqual({ marks: 1, groups: 1, members: 2 });
    expect(mergeDocuments(doc, incoming).report).toEqual({ marks: 0, groups: 0, members: 0 });
  });

  it("words counts and reports", () => {
    expect(countsText({ marks: [], groups: [] })).toBe("0 marks, 0 groups");
    expect(countsText({ marks: [stored("a")], groups: [{ id: "g", name: "G", marks: [] }] })).toBe(
      "1 mark, 1 group",
    );
    expect(reportText({ marks: 3, groups: 1, members: 2 })).toBe(
      "Added 3 marks, 1 group, 2 memberships",
    );
    expect(reportText({ marks: 0, groups: 0, members: 1 })).toBe("Added 1 membership");
    expect(reportText({ marks: 0, groups: 0, members: 0 })).toBe("Nothing new");
  });

  it("reads, merges and replaces the stored document", () => {
    const m = memory();
    const s = createMarks(m.storage, deps());
    const a = s.add(quake);
    const g = s.addGroup("G");
    s.setMember(a.id, g.id, true);
    expect(s.document()).toEqual({ marks: s.marks.value, groups: s.groups.value });
    const r = s.merge({ marks: [stored("x")], groups: [{ id: g.id, name: "G", marks: ["x"] }] });
    expect(r).toEqual({ marks: 1, groups: 0, members: 1 });
    expect(s.marks.value.map((x) => x.id)).toEqual([a.id, "x"]);
    expect(s.view(g.id)?.marks.map((x) => x.id)).toEqual([a.id, "x"]);
    expect(JSON.parse(m.store.get(MARKS_KEY) ?? "")).toMatchObject({
      marks: [{ id: a.id }, { id: "x" }],
    });
    s.replaceAll({ marks: [stored("y")], groups: [] });
    expect(s.marks.value.map((x) => x.id)).toEqual(["y"]);
    expect(s.groups.value).toEqual([]);
    expect(JSON.parse(m.store.get(MARKS_KEY) ?? "")).toMatchObject({
      marks: [{ id: "y" }],
      groups: [],
    });
  });
});
