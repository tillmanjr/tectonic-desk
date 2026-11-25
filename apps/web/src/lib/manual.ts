import type { ComputedRef, InjectionKey } from "vue";
import { GLOSSARY_CHAPTER, isTermId } from "./glossary.js";
import type { Tour, TourId, TourProgressDocument } from "./tour.js";

/**
 * The Field manual: an introduction, the quick tours as the introductory tours, then the deep
 * dives filed in chapters, one to each part of the desk, and the Glossary last. A chapter and a card
 * are named in the address's hash, `#<chapter>` or `#<chapter>/<tour id>`, so the way back from a
 * deep dive lands on its card; in the Glossary the card is an entry, `#glossary/<term id>`.
 */

export interface Chapter {
  /** The hash that opens it. */
  id: string;
  title: string;
  blurb: string;
  /** The quick tour that first shows this part of the desk; none for the introduction. */
  introducedBy: TourId | null;
  tours: readonly Tour[];
}

export const INTRO_CHAPTER = "intro";
export const TOURS_CHAPTER = "tours";

/** A deep dive area as a chapter id: lower case, every run of anything else one hyphen. */
export const areaSlug = (area: string): string =>
  area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** What each area's chapter says of itself, and the quick tour that introduces it. */
const AREAS: Record<string, { blurb: string; introducedBy: TourId }> = {
  Refine: {
    blurb:
      "What the map, the tables and the charts are drawn from: the two refine bars, the Space window and the tables' own column filters.",
    introducedBy: "earthquakes",
  },
  Map: {
    blurb:
      "One map serves every page but Space. Each deep dive here takes one of its controls in turn on a real example, and gives the map back as you had it.",
    introducedBy: "map",
  },
  "Earthquake detail": {
    blurb:
      "The panel an event opens: the origin and how the catalogue holds it, the felt and modelled impact, and the focal mechanism read plane by plane.",
    introducedBy: "earthquakes",
  },
  Charts: {
    blurb:
      "The three charts under the catalogue: magnitude through time with the completeness breaks, frequency against magnitude with the b-value, and depth.",
    introducedBy: "earthquakes",
  },
  "Volcano detail": {
    blurb:
      "The panel a volcano opens: each agency's status on its own scale, the eruption record, and the earthquakes around it.",
    introducedBy: "volcanoes",
  },
  Marks: {
    blurb:
      "Keeping events and volcanoes to come back to: groups, the stacked panels, the pairwise Compare, and moving marks between browsers.",
    introducedBy: "marks",
  },
  Space: {
    blurb:
      "The Space page row by row: the tiles, the stacked series, flares and alerts, the aurora oval, the Sun, and the long record back to 1932.",
    introducedBy: "space",
  },
  Settings: {
    blurb:
      "Time zone, theme, the panel's beachball, these ◆ marks, the glossary's underlines and trigger, and how hints show with a mouse, a keyboard or a finger.",
    introducedBy: "orientation",
  },
};

/** The introduction, always first, then the chapters after it. */
export type Chapters = [Chapter, ...Chapter[]];

/**
 * The introduction (prose, no tours), the introductory tours (the quick tours), then a chapter to
 * each deep dive area in the order the catalogue gives them.
 */
export function chaptersOf(tours: readonly Tour[]): Chapters {
  const quick = tours.filter((t) => t.deep === undefined);
  const out: Chapters = [
    {
      id: INTRO_CHAPTER,
      title: "Introduction to Tectonic Desk",
      blurb:
        "What the desk is for, how its four pages fit together, and how this manual is laid out.",
      introducedBy: null,
      tours: [],
    },
    {
      id: TOURS_CHAPTER,
      title: "Introductory tours",
      blurb:
        "The quick tours: each walks one page, or one side of the desk, from start to finish in a few minutes. Start with Orientation.",
      introducedBy: null,
      tours: quick,
    },
  ];
  for (const t of tours) {
    if (t.deep === undefined) continue;
    const id = areaSlug(t.deep.area);
    const had = out.find((c) => c.id === id);
    if (had !== undefined) {
      had.tours = [...had.tours, t];
      continue;
    }
    const about = AREAS[t.deep.area];
    out.push({
      id,
      title: t.deep.area,
      blurb: about?.blurb ?? "",
      introducedBy: about?.introducedBy ?? null,
      tours: [t],
    });
  }
  out.push({
    id: GLOSSARY_CHAPTER,
    title: "Glossary",
    blurb:
      "The terms the desk shows and the words it uses for its own tools. Each entry starts with the line a linked term's hint shows, then says how the desk uses it.",
    introducedBy: null,
    tours: [],
  });
  return out;
}

/** The chapter with this id; an id no chapter has reads as the introduction. */
export const chapterById = (chapters: Chapters, id: string): Chapter =>
  chapters.find((c) => c.id === id) ?? chapters[0];

/** The chapter and card (a Glossary entry in the Glossary) a hash names; anything unknown opens the introduction. */
export function parseManualHash(
  hash: string,
  chapters: readonly Chapter[],
): { chapter: string; card: TourId | null } {
  const [chapter = "", card = ""] = hash.replace(/^#/, "").split("/");
  const ch = chapters.find((c) => c.id === chapter);
  if (ch === undefined) return { chapter: INTRO_CHAPTER, card: null };
  const known = ch.id === GLOSSARY_CHAPTER ? isTermId(card) : ch.tours.some((t) => t.id === card);
  return { chapter: ch.id, card: known ? card : null };
}

/** The hash for a chapter, or for a card in it. */
export const manualHash = (chapter: string, card: TourId | null = null): string =>
  card === null ? `#${chapter}` : `#${chapter}/${card}`;

/** What a deep dive covers, by its steps: every title between the opening and the closing one. */
export const coverOf = (t: Tour): string[] => t.steps.slice(1, -1).map((s) => s.title);

/** How many of a set of tours the reader has walked to the end. */
export function takenCount(doc: TourProgressDocument, tours: readonly Tour[]): number {
  return tours.filter((t) => doc.tours[t.id]?.done === true).length;
}

/** The Field manual as the shell gives it to components: the address is the shell's alone. */
export interface ManualNav {
  /** Whether the manual is the page on screen. */
  open: ComputedRef<boolean>;
  /** The chapter and card the address names. */
  at: ComputedRef<{ chapter: string; card: TourId | null }>;
  /** Opens the manual at a chapter (the introduction by default), or a card in it. */
  show: (chapter?: string, card?: TourId | null) => void;
  /**
   * Takes a tour from the manual: it runs in the reader's last view of the desk, and its end offers
   * the way back to `chapter`, at its card.
   */
  take: (id: TourId, step: number, chapter: string) => void;
}

export const MANUAL: InjectionKey<ManualNav> = Symbol("manual");
