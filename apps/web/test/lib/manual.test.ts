import { describe, expect, it } from "vitest";
import {
  areaSlug,
  chapterById,
  chaptersOf,
  coverOf,
  INTRO_CHAPTER,
  manualHash,
  parseManualHash,
  takenCount,
  TOURS_CHAPTER,
} from "../../src/lib/manual.js";
import { createTourProgress, type Tour } from "../../src/lib/tour.js";
import { TOURS } from "../../src/lib/tour-catalog.js";

const tour = (id: string, area?: string, steps = 3): Tour => ({
  id,
  title: id,
  blurb: "",
  pageFor: (p) => p,
  steps: Array.from({ length: steps }, (_, i) => ({
    id: `s${String(i)}`,
    title: `Step ${String(i)}`,
    body: "",
    targets: [],
  })),
  ...(area === undefined ? {} : { deep: { area } }),
});

describe("the Field manual's chapters", () => {
  it("slugs an area for the address", () => {
    expect(areaSlug("Earthquake detail")).toBe("earthquake-detail");
    expect(areaSlug(" Map & more! ")).toBe("map-more");
  });

  it("opens with the quick tours, then gives each deep dive area a chapter in catalogue order", () => {
    const chapters = chaptersOf(TOURS);
    expect(chapters.map((c) => c.id)).toEqual([
      INTRO_CHAPTER,
      TOURS_CHAPTER,
      "refine",
      "map",
      "earthquake-detail",
      "charts",
      "volcano-detail",
      "marks",
      "space",
      "settings",
      "glossary",
    ]);
    const [intro, quick, refine] = chapters;
    expect(intro.tours).toEqual([]);
    expect(intro.introducedBy).toBeNull();
    expect(quick?.tours.length).toBeGreaterThan(0);
    expect(quick?.tours.every((t) => t.deep === undefined)).toBe(true);
    expect(refine?.introducedBy).toBe("earthquakes");
    expect(chapters.reduce((n, c) => n + c.tours.length, 0)).toBe(TOURS.length);
    // Every introducing tour is a quick tour the catalogue has.
    for (const c of chapters.slice(2)) {
      expect(TOURS.find((t) => t.id === c.introducedBy)?.deep).toBeUndefined();
      expect(c.blurb).not.toBe("");
    }
  });

  it("files an area it has no words for under its own name", () => {
    const [, , odd] = chaptersOf([tour("q"), tour("d", "Odd corner")]);
    expect(odd).toMatchObject({
      id: "odd-corner",
      title: "Odd corner",
      blurb: "",
      introducedBy: null,
    });
  });

  it("reads a chapter and a card from the hash, and writes them back", () => {
    const chapters = chaptersOf(TOURS);
    expect(parseManualHash("", chapters)).toEqual({ chapter: INTRO_CHAPTER, card: null });
    expect(parseManualHash("#nowhere/map-fields", chapters)).toEqual({
      chapter: INTRO_CHAPTER,
      card: null,
    });
    expect(parseManualHash("#map", chapters)).toEqual({ chapter: "map", card: null });
    expect(parseManualHash("#map/map-fields", chapters)).toEqual({
      chapter: "map",
      card: "map-fields",
    });
    // A card filed in another chapter is not this one's.
    expect(parseManualHash("#map/space-sun", chapters)).toEqual({ chapter: "map", card: null });
    // The Glossary's card is an entry.
    expect(parseManualHash("#glossary/kp", chapters)).toEqual({ chapter: "glossary", card: "kp" });
    expect(parseManualHash("#glossary/map-fields", chapters)).toEqual({
      chapter: "glossary",
      card: null,
    });
    expect(chapterById(chapters, "map").title).toBe("Map");
    expect(chapterById(chapters, "nowhere").id).toBe(INTRO_CHAPTER);
    expect(manualHash("map")).toBe("#map");
    expect(manualHash("map", "map-fields")).toBe("#map/map-fields");
  });

  it("lists what a deep dive covers and counts the ones taken", () => {
    expect(coverOf(tour("a", "X", 4))).toEqual(["Step 1", "Step 2"]);
    const progress = createTourProgress(null);
    const tours = [tour("a", "X"), tour("b", "X")];
    expect(takenCount(progress.doc.value, tours)).toBe(0);
    progress.record("a", 0, true);
    progress.record("b", 1, false);
    expect(takenCount(progress.doc.value, tours)).toBe(1);
  });
});
