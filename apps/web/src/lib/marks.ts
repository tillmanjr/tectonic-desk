import { ref, type Ref } from "vue";

export type MarkKind = "event" | "volcano";
/** Which schematic a mark's thumbnail draws. */
export type ThumbFrame = "world" | "wc";

/** A view the reader kept: the route as it was, plus enough of the subject to list it without a fetch. */
export interface Mark {
  id: string;
  kind: MarkKind;
  /** USGS event id, or the GVP number as a string. */
  ref: string;
  name: string;
  /** Path and query of the view as marked, overlay keys removed. */
  url: string;
  frame: ThumbFrame;
  lon: number;
  lat: number;
  /** "M6.9 mww" or the volcano's name. */
  headline: string;
  /** The place, or "country · region". */
  sub: string;
  /** Origin time (ISO) for an event; null for a volcano. */
  stamp: string | null;
  /** Magnitude and depth for an earthquake; null for a volcano or when unknown. */
  mag: number | null;
  depthKm: number | null;
  createdAt: string;
}
export interface MarkGroup {
  id: string;
  name: string;
  /** Mark ids, in the order added. */
  marks: string[];
}
export type MarkDraft = Omit<Mark, "id" | "createdAt">;
/** What a panel knows about its subject; the button adds `name` and `url`. */
export type MarkSubject = Omit<MarkDraft, "name" | "url">;
/** A group as shown: `All` resolved, members resolved to marks, in the group's own order. */
export interface MarkView {
  id: string;
  name: string;
  virtual: boolean;
  marks: Mark[];
}
/** The whole stored document: what `localStorage` holds and what an export file carries. */
export interface MarksDocument {
  marks: Mark[];
  groups: MarkGroup[];
}
/** What a merge added. */
export interface MergeReport {
  marks: number;
  groups: number;
  /** Members added to groups already present. */
  members: number;
}

export const MARKS_KEY = "tectonic.marks";
export const ALL_GROUP = "all";
/** Every word the feature shows, in one place, so a better term is a one-line change. */
export const MARK_TERMS = {
  verb: "Mark",
  noun: "Marks",
  title: "Marked events",
  group: "Group",
  groups: "Groups",
  all: "All",
  /** What gets marked, for tooltips. */
  things: "earthquakes and eruptions",
} as const;
export const NAME_MAX = 120;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isKind = (v: unknown): v is MarkKind => v === "event" || v === "volcano";
const isFrame = (v: unknown): v is ThumbFrame => v === "world" || v === "wc";
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The magnitude stored with a mark, else the one its headline opens with (marks saved before the field existed). */
function magOf(v: unknown, headline: string): number | null {
  if (isNum(v)) return v;
  const m = /^M(\d+(?:\.\d+)?)\b/.exec(headline)?.[1];
  return m === undefined ? null : Number(m);
}

function parseMark(v: unknown): Mark | null {
  if (!isRecord(v)) return null;
  const { id, kind, ref: r, name, url, frame, lon, lat, headline, sub, stamp, createdAt } = v;
  if (!isStr(id) || !isKind(kind) || !isStr(r) || !isStr(name) || !isStr(url)) return null;
  if (!isFrame(frame) || !isNum(lon) || !isNum(lat) || !isStr(headline) || !isStr(sub)) return null;
  if (!(isStr(stamp) || stamp === null) || !isStr(createdAt)) return null;
  const mag = magOf(v.mag, headline);
  const depthKm = isNum(v.depthKm) ? v.depthKm : null;
  return {
    id,
    kind,
    ref: r,
    name,
    url,
    frame,
    lon,
    lat,
    headline,
    sub,
    stamp,
    mag,
    depthKm,
    createdAt,
  };
}

/** The stored document; malformed marks and groups are dropped rather than failing the whole read. */
export function parseMarks(raw: string | null): MarksDocument {
  let parsed: unknown = null;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const root = isRecord(parsed) ? parsed : {};
  const marks = (Array.isArray(root.marks) ? root.marks : [])
    .map(parseMark)
    .filter((m): m is Mark => m !== null);
  const known = new Set(marks.map((m) => m.id));
  const groups: MarkGroup[] = [];
  for (const g of Array.isArray(root.groups) ? root.groups : []) {
    if (!isRecord(g) || !isStr(g.id) || !isStr(g.name) || !Array.isArray(g.marks)) continue;
    if (g.id === ALL_GROUP) continue;
    groups.push({
      id: g.id,
      name: g.name,
      marks: g.marks.filter((m): m is string => isStr(m) && known.has(m)),
    });
  }
  return { marks, groups };
}

/** The name offered for a subject before the reader edits it. */
export const defaultName = (s: MarkSubject): string => `${s.headline} · ${s.sub}`;

/** The JSON text of a document as the export file carries it. */
export const exportDocument = (doc: MarksDocument, now: Date): string =>
  JSON.stringify(
    { v: 1, exportedAt: now.toISOString(), marks: doc.marks, groups: doc.groups },
    null,
    2,
  );

/** The name of an export made at `now`. */
export const exportFileName = (now: Date): string =>
  `tectonic-marks-${now.toISOString().slice(0, 10)}.json`;

/**
 * `current` plus what `incoming` has that it lacks: marks by id (appended in file order), groups
 * by id (appended), and for a group present in both, the members it lacks whose marks are known.
 * Names and order of what is already there are kept.
 */
export function mergeDocuments(
  current: MarksDocument,
  incoming: MarksDocument,
): { doc: MarksDocument; report: MergeReport } {
  const known = new Set(current.marks.map((m) => m.id));
  const newMarks = incoming.marks.filter((m) => !known.has(m.id));
  const marks = [...current.marks, ...newMarks];
  for (const m of newMarks) known.add(m.id);
  let members = 0;
  const groups = current.groups.map((g) => {
    const theirs = incoming.groups.find((x) => x.id === g.id);
    if (theirs === undefined) return g;
    const add = theirs.marks.filter((id) => known.has(id) && !g.marks.includes(id));
    members += add.length;
    return add.length === 0 ? g : { ...g, marks: [...g.marks, ...add] };
  });
  const newGroups = incoming.groups
    .filter((g) => !current.groups.some((x) => x.id === g.id))
    .map((g) => ({ ...g, marks: g.marks.filter((id) => known.has(id)) }));
  return {
    doc: { marks, groups: [...groups, ...newGroups] },
    report: { marks: newMarks.length, groups: newGroups.length, members },
  };
}

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** "3 marks, 1 group". */
export const countsText = (doc: MarksDocument): string =>
  `${plural(doc.marks.length, "mark")}, ${plural(doc.groups.length, "group")}`;

/** "Added 3 marks, 1 group, 2 memberships", zero parts left out; "Nothing new" when all are. */
export function reportText(r: MergeReport): string {
  const parts = [
    [r.marks, "mark"],
    [r.groups, "group"],
    [r.members, "membership"],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, w]) => plural(n, w));
  return said.length === 0 ? "Nothing new" : `Added ${said.join(", ")}`;
}

const cleanName = (name: string, fallback: string): string => {
  const t = name.trim().slice(0, NAME_MAX);
  return t === "" ? fallback : t;
};
const randomId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export interface MarksStore {
  /** Newest first. */
  marks: Readonly<Ref<Mark[]>>;
  /** In creation order. */
  groups: Readonly<Ref<MarkGroup[]>>;
  add(draft: MarkDraft): Mark;
  rename(id: string, name: string): void;
  remove(id: string): void;
  addGroup(name: string): MarkGroup;
  renameGroup(id: string, name: string): void;
  removeGroup(id: string): void;
  /** Membership of a stored group; `all` and unknown ids are ignored. */
  setMember(markId: string, groupId: string, member: boolean): void;
  /** Moves a mark one place up (-1) or down (1) within `all` or a stored group; ends and unknown ids are no-ops. */
  move(groupId: string, markId: string, delta: -1 | 1): void;
  /** Moves a stored group one place up (-1) or down (1); ends and unknown ids are no-ops. */
  moveGroup(id: string, delta: -1 | 1): void;
  /** The document as stored. */
  document(): MarksDocument;
  /** Adds what the document has that the store lacks; returns what was added. */
  merge(doc: MarksDocument): MergeReport;
  /** Discards the stored document for this one. */
  replaceAll(doc: MarksDocument): void;
  /** `all` or a stored group with its members resolved in its order; null for an unknown id. */
  view(groupId: string): MarkView | null;
  /** How many marks name this subject. */
  countFor(kind: MarkKind, ref: string): number;
  /** The stored groups a mark belongs to. */
  groupsOf(markId: string): MarkGroup[];
}

interface Deps {
  id: () => string;
  now: () => Date;
}

function readRaw(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(MARKS_KEY) ?? null;
  } catch {
    return null;
  }
}

/** The reader's marked views and groups, persisted in localStorage; `storage: null` keeps them in memory. */
export function createMarks(
  storage: StorageLike | null = localStorage,
  deps: Deps = { id: randomId, now: () => new Date() },
): MarksStore {
  const initial = parseMarks(readRaw(storage));
  const marks = ref<Mark[]>(initial.marks);
  const groups = ref<MarkGroup[]>(initial.groups);
  function persist(): void {
    try {
      storage?.setItem(
        MARKS_KEY,
        JSON.stringify({ v: 1, marks: marks.value, groups: groups.value }),
      );
    } catch {
      // storage full or disabled; the change still applies for this page
    }
  }
  const find = (id: string): Mark | undefined => marks.value.find((m) => m.id === id);
  const findGroup = (id: string): MarkGroup | undefined => groups.value.find((g) => g.id === id);
  const isMark = (m: Mark | undefined): m is Mark => m !== undefined;
  /** Marks in the order of an id list; ids always name a mark, since removal cascades and parsing filters. */
  const inOrder = (ids: string[]): Mark[] => {
    const byId = new Map(marks.value.map((m) => [m.id, m]));
    return ids.map((id) => byId.get(id)).filter(isMark);
  };
  return {
    marks,
    groups,
    add(draft) {
      const mark: Mark = {
        ...draft,
        name: cleanName(draft.name, draft.headline),
        id: deps.id(),
        createdAt: deps.now().toISOString(),
      };
      marks.value = [mark, ...marks.value];
      persist();
      return mark;
    },
    rename(id, name) {
      const m = find(id);
      if (m === undefined) return;
      m.name = cleanName(name, m.headline);
      persist();
    },
    remove(id) {
      marks.value = marks.value.filter((m) => m.id !== id);
      for (const g of groups.value) g.marks = g.marks.filter((m) => m !== id);
      persist();
    },
    addGroup(name) {
      const g: MarkGroup = {
        id: deps.id(),
        name: cleanName(name, `${MARK_TERMS.group} ${String(groups.value.length + 1)}`),
        marks: [],
      };
      groups.value = [...groups.value, g];
      persist();
      return g;
    },
    renameGroup(id, name) {
      const g = findGroup(id);
      if (g === undefined) return;
      g.name = cleanName(name, g.name);
      persist();
    },
    removeGroup(id) {
      groups.value = groups.value.filter((g) => g.id !== id);
      persist();
    },
    setMember(markId, groupId, member) {
      const g = findGroup(groupId);
      if (g === undefined || find(markId) === undefined) return;
      const has = g.marks.includes(markId);
      if (member && !has) g.marks = [...g.marks, markId];
      else if (!member && has) g.marks = g.marks.filter((m) => m !== markId);
      else return;
      persist();
    },
    move(groupId, markId, delta) {
      const g = groupId === ALL_GROUP ? null : findGroup(groupId);
      if (g === undefined) return;
      const list = g === null ? marks.value.map((m) => m.id) : g.marks;
      const i = list.indexOf(markId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      const next = [...list];
      next.splice(j, 0, ...next.splice(i, 1));
      if (g === null) marks.value = inOrder(next);
      else g.marks = next;
      persist();
    },
    moveGroup(id, delta) {
      const i = groups.value.findIndex((g) => g.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= groups.value.length) return;
      const next = [...groups.value];
      next.splice(j, 0, ...next.splice(i, 1));
      groups.value = next;
      persist();
    },
    document: () => ({ marks: marks.value, groups: groups.value }),
    merge(doc) {
      const { doc: next, report } = mergeDocuments(
        { marks: marks.value, groups: groups.value },
        doc,
      );
      marks.value = next.marks;
      groups.value = next.groups;
      persist();
      return report;
    },
    replaceAll(doc) {
      marks.value = doc.marks;
      groups.value = doc.groups;
      persist();
    },
    view(groupId) {
      if (groupId === ALL_GROUP) {
        return { id: ALL_GROUP, name: MARK_TERMS.all, virtual: true, marks: marks.value };
      }
      const g = findGroup(groupId);
      if (g === undefined) return null;
      return { id: g.id, name: g.name, virtual: false, marks: inOrder(g.marks) };
    },
    countFor: (kind, r) => marks.value.filter((m) => m.kind === kind && m.ref === r).length,
    groupsOf: (markId) => groups.value.filter((g) => g.marks.includes(markId)),
  };
}
